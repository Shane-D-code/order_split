// End-to-end style test of the really used path: a scanned QR in the
// "Scan a code" tab feeds the existing accept-pairing flow.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeviceIdentity } from "../../src/domain/types";
import { createDeviceIdentity } from "../../src/crypto/crypto";
import { saveDeviceIdentity } from "../../src/db/repositories/identity";
import { clearFamily, listFamilyMembers } from "../../src/db/repositories/family";
import { setRelayUrl } from "../../src/db/repositories/settings";
import { buildPairInvite, inviteToText, parsePairInvite, buildPairingAck } from "../../src/pairing/pairing";
import { createRelayClient } from "../../src/sync/relay-client";
import { PairPage } from "../../src/pages/PairPage";
import { FakeRelay } from "./fake-relay";

const RELAY = "https://relay.test.workers.dev";

const jsqrMock = vi.hoisted(() => vi.fn());
vi.mock("jsqr", () => ({ default: jsqrMock }));

function installCamera() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  return { track, getUserMedia };
}

function stubCanvas() {
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
  return ctx;
}

function prepareVideo(container: HTMLElement): void {
  const video = container.querySelector("video");
  if (!video) throw new Error("video element not rendered");
  Object.defineProperty(video, "readyState", { value: 2, configurable: true });
  Object.defineProperty(video, "videoWidth", { value: 640, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: 480, configurable: true });
  vi.spyOn(video, "play").mockResolvedValue(undefined);
}

let relay: FakeRelay;
let initiator: DeviceIdentity;
let current: DeviceIdentity;

beforeEach(async () => {
  initiator = await createDeviceIdentity("Amaan");
  current = await createDeviceIdentity("Bina");
  await saveDeviceIdentity(current);
  await clearFamily();
  await setRelayUrl(RELAY);
  relay = new FakeRelay([initiator, current]);
  globalThis.fetch = relay.fetch;
  jsqrMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

async function createInviteOnInitiator(): Promise<string> {
  const code = await createRelayClient({ baseUrl: RELAY, identity: initiator }).initiatePairing();
  const invite = buildPairInvite(initiator, code, RELAY, "c2VlZA");
  return inviteToText(invite);
}

describe("PairPage scanning a Family Orders QR", () => {
  it("decoded invite reaches the existing accept flow and stores the peer", async () => {
    const user = userEvent.setup();
    const { track } = installCamera();
    stubCanvas();
    const inviteText = await createInviteOnInitiator();
    const invite = parsePairInvite(inviteText)!;

    const { container } = render(<PairPage />);

    await user.click(await screen.findByRole("button", { name: /Scan a code/ }));
    await screen.findByRole("button", { name: "Open camera / Scan QR" });
    prepareVideo(container);

    // The camera feed decodes the Family Orders invite on the first frame.
    jsqrMock.mockReturnValueOnce({ data: inviteText });
    await user.click(screen.getByRole("button", { name: "Open camera / Scan QR" }));

    // The accept flow ran: relay handshake done, scanner released the camera,
    // and the initiator is stored locally as a connected family member.
    await waitFor(async () => {
      const members = await listFamilyMembers();
      expect(members.some((m) => m.deviceId === initiator.deviceId)).toBe(true);
    });

    const members = await listFamilyMembers();
    const peer = members.find((m) => m.deviceId === initiator.deviceId);
    expect(peer?.pairingStatus).toBe("connected");
    expect(peer?.displayName).toBe("Amaan");
    expect(peer?.publicKeyJwk).toEqual(initiator.publicKeyJwk);

    await waitFor(() => expect(track.stop).toHaveBeenCalled());

    // The pairing code is single-use: re-accepting it is rejected by the relay.
    const client = createRelayClient({ baseUrl: RELAY, identity: current });
    const secondAck = await buildPairingAck(invite, current);
    await expect(client.completePairing(invite.pairingCode, secondAck)).rejects.toThrow();
  });

  it("pastes fallback still works without the camera", async () => {
    const user = userEvent.setup();
    const inviteText = await createInviteOnInitiator();

    render(<PairPage />);
    await user.click(await screen.findByRole("button", { name: /Scan a code/ }));

    const textarea = await screen.findByPlaceholderText("Paste the full invite text here…");
    fireEvent.change(textarea, { target: { value: inviteText } });
    await user.click(screen.getByRole("button", { name: "Accept pairing" }));

    await waitFor(async () => {
      const members = await listFamilyMembers();
      expect(members.some((m) => m.deviceId === initiator.deviceId)).toBe(true);
    });
    const members = await listFamilyMembers();
    expect(members[0].pairingStatus).toBe("connected");
  });
});