import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QrScanner } from "../../src/components/scanner/QrScanner";

const jsqrMock = vi.hoisted(() => vi.fn());

vi.mock("jsqr", () => ({ default: jsqrMock }));

function installCamera(rejectWith?: unknown) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = rejectWith
    ? vi.fn().mockRejectedValue(rejectWith)
    : vi.fn().mockResolvedValue(stream);
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

function prepareVideo(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector("video");
  if (!video) throw new Error("video element not rendered");
  Object.defineProperty(video, "readyState", { value: 2, configurable: true });
  Object.defineProperty(video, "videoWidth", { value: 640, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: 480, configurable: true });
  vi.spyOn(video, "play").mockResolvedValue(undefined);
  return video as HTMLVideoElement;
}

function decodeOnce(text: string | null) {
  jsqrMock.mockReturnValueOnce(text === null ? null : { data: text });
}

beforeEach(() => {
  jsqrMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  // jsqr mock survives restoreAllMocks (module mock), but the return queue was cleared.
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

describe("QrScanner", () => {
  it("shows the camera action when idle", async () => {
    const { container } = render(<QrScanner onResult={() => true} />);
    expect(await screen.findByRole("button", { name: "Open camera / Scan QR" })).toBeTruthy();
    expect(container.querySelector("video")).not.toBeNull();
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("requests the rear/environment camera and starts scanning", async () => {
    const user = userEvent.setup();
    const { getUserMedia } = installCamera();
    stubCanvas();
    const { container } = render(<QrScanner onResult={() => true} />);
    prepareVideo(container);
    decodeOnce(null);

    await user.click(await screen.findByRole("button", { name: "Open camera / Scan QR" }));

    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({ facingMode: { ideal: "environment" } }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("Keep the code inside the frame.")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("stops and releases the camera after a valid decode", async () => {
    const user = userEvent.setup();
    const { track, getUserMedia } = installCamera();
    stubCanvas();
    const onResult = vi.fn((text: string) => text === "PAIR-INVITE");
    const { container } = render(<QrScanner onResult={onResult} />);
    prepareVideo(container);
    decodeOnce("PAIR-INVITE");

    await user.click(await screen.findByRole("button", { name: "Open camera / Scan QR" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith("PAIR-INVITE"));
    expect(track.stop).toHaveBeenCalledTimes(1);
    // Back to the idle action so the same scanner can be reused.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open camera / Scan QR" })).toBeTruthy(),
    );
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid QR safely and keeps the camera scanning", async () => {
    const user = userEvent.setup();
    const { track } = installCamera();
    stubCanvas();
    const onResult = vi.fn((text: string) => text === "REAL-INVITE");
    const { container } = render(<QrScanner onResult={onResult} />);
    prepareVideo(container);
    // Keep decoding junk until the test flips the accepted value.
    let validNext = false;
    jsqrMock.mockImplementation(() => ({ data: validNext ? "REAL-INVITE" : "not-an-invite" }));

    await user.click(await screen.findByRole("button", { name: "Open camera / Scan QR" }));

    // Rejected decode: banner shown, camera still live, no accept.
    await waitFor(() =>
      expect(
        screen.getByText("That isn't a Family Orders pairing code — try again."),
      ).toBeTruthy(),
    );
    expect(track.stop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    // Now a valid code arrives on the live stream.
    validNext = true;
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("REAL-INVITE"));
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("shows a permission-denied state and can retry", async () => {
    const user = userEvent.setup();
    installCamera(new DOMException("denied", "NotAllowedError"));
    render(<QrScanner onResult={() => true} />);

    await user.click(await screen.findByRole("button", { name: "Open camera / Scan QR" }));

    expect(await screen.findByText("Camera access is turned off.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows an unavailable state when there is no camera", async () => {
    const user = userEvent.setup();
    installCamera(new DOMException("no device", "NotFoundError"));
    render(<QrScanner onResult={() => true} />);

    await user.click(await screen.findByRole("button", { name: "Open camera / Scan QR" }));

    expect(await screen.findByText("No camera was found on this device.")).toBeTruthy();
  });

  it("releases the camera when the component unmounts mid-scan", async () => {
    const user = userEvent.setup();
    const { track } = installCamera();
    stubCanvas();
    const { container, unmount } = render(<QrScanner onResult={() => true} />);
    prepareVideo(container);
    decodeOnce(null);

    await user.click(await screen.findByRole("button", { name: "Open camera / Scan QR" }));
    await waitFor(() =>
      expect(screen.getByText("Keep the code inside the frame.")).toBeTruthy(),
    );

    unmount();
    expect(track.stop).toHaveBeenCalled();
  });
});