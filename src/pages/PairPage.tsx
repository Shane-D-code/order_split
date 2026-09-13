import { useEffect, useState } from "react";
import { Screen, Spinner } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PhonePair, Sparkle } from "../components/design/Art";
import { useIdentity } from "../app/onboarding";
import { getRelayUrl } from "../db/repositories/settings";
import type { DeviceIdentity } from "../domain/types";
import { createRelayClient, RelayError } from "../sync/relay-client";
import {
  buildPairInvite,
  inviteToText,
  parsePairInvite,
  buildPairingAck,
  type PairInvite,
} from "../pairing/pairing";
import { b64JwkToPublicKeyJwk } from "../crypto/crypto";
import { savePairingSeed } from "../sync/engine";
import { addFamilyMember } from "../db/repositories/family";

async function qrToDataUrl(text: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 2, width: 360 });
}

function randomSeedB64(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += chars.charAt(b % chars.length);
  return s;
}

type View = "invite" | "accept";

export function PairPage() {
  const { identity } = useIdentity();
  const [view, setView] = useState<View>("invite");
  const [relayUrl, setRelayUrlState] = useState<string | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);

  useEffect(() => {
    void getRelayUrl().then(setRelayUrlState);
  }, []);

  if (!identity) return null;

  return (
    <Screen plain>
      <div className="relative">
        <Sparkle className="absolute right-2 top-2 h-8 w-8 animate-spark" />
        <p className="kicker text-muted">Pairing</p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[1.02] tracking-tight text-ink">
          Connect
          <br />
          a family phone
        </h1>
        <p className="mt-3 flex items-start gap-3 text-sm font-medium text-soft">
          <span className="shrink-0">
            <PhonePair className="h-20 w-20 animate-float" />
          </span>
          <span>
            Pair another phone so family orders show up on every device. Only your name and a
            public key leave this phone — orders stay encrypted on-device, and the relay never
            reads them.
          </span>
        </p>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3">
        <button
          onClick={() => setView("invite")}
          className={`rounded-md border-2 border-ink px-4 py-3 text-sm font-extrabold shadow-[3px_4px_0_0_var(--fo-ink)] transition-transform active:translate-y-[2px] active:shadow-none ${
            view === "invite" ? "bg-gold text-on-gold" : "bg-surface text-ink"
          }`}
        >
          Show my code
        </button>
        <button
          onClick={() => setView("accept")}
          className={`rounded-md border-2 border-ink px-4 py-3 text-sm font-extrabold shadow-[3px_4px_0_0_var(--fo-ink)] transition-transform active:translate-y-[2px] active:shadow-none ${
            view === "accept" ? "bg-gold text-on-gold" : "bg-surface text-ink"
          }`}
        >
          Scan a code
        </button>
      </div>

      {relayUrl === null ? <Spinner label="Loading pairing…" /> : null}
      {relayUrl !== null ? (
        <div className="mt-5 space-y-4">
          {view === "invite" ? (
            <InvitePane identity={identity} relayUrl={relayUrl} onError={setRelayError} />
          ) : (
            <AcceptPane identity={identity} onError={setRelayError} />
          )}

          {relayError ? (
            <p className="rounded-md border-2 border-tomato/70 bg-tomato/10 p-3 text-sm font-semibold text-danger">
              {relayError}
            </p>
          ) : null}
        </div>
      ) : null}
    </Screen>
  );
}

function InvitePane({
  identity,
  relayUrl,
  onError,
}: {
  identity: DeviceIdentity;
  relayUrl: string;
  onError: (msg: string | null) => void;
}) {
  const [invite, setInvite] = useState<PairInvite | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createInvite() {
    onError(null);
    setBusy(true);
    try {
      const relay = createRelayClient({ baseUrl: relayUrl, identity });
      const pairingCode = await relay.initiatePairing();
      const pairingSeedB64 = randomSeedB64();
      const next = buildPairInvite(identity, pairingCode, relayUrl, pairingSeedB64);
      setInvite(next);
      setQr(await qrToDataUrl(inviteToText(next)));
      await savePairingSeed(pairingSeedB64);
    } catch (err) {
      handleRelayErr(err, onError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      {busy ? <Spinner label="Creating your code…" /> : null}
      {!busy && !invite ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="text-sm font-bold text-ink">Scan this code from the other phone.</p>
          <p className="text-xs text-muted">The code expires in a few minutes.</p>
          <Button className="mt-1" onClick={() => void createInvite()}>
            Show QR code
          </Button>
        </div>
      ) : null}
      {qr && invite ? (
        <div className="flex flex-col items-center gap-4">
          <img
            src={qr}
            alt="Pairing QR code — scan from the other phone"
            className="h-60 w-60 rounded-sm border-2 border-ink bg-surface-2 shadow-[4px_5px_0_0_var(--fo-ink)]"
          />
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                void navigator.clipboard?.writeText(inviteToText(invite)).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                })
              }
            >
              {copied ? "Copied ✓" : "Copy invite text"}
            </Button>
            <p className="text-center text-xs text-muted">
              Share this QR or the invite text. A new invite resets the pairing entirely.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function AcceptPane({
  identity,
  onError,
}: {
  identity: DeviceIdentity;
  onError: (msg: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function accept() {
    onError(null);
    const invite = parsePairInvite(text);
    if (!invite) {
      onError("This doesn't look like a valid invite. Scan it again or paste the full text.");
      return;
    }
    setBusy(true);
    try {
      const ack = await buildPairingAck(invite, identity);
      const relay = createRelayClient({ baseUrl: invite.relayUrl, identity });
      await relay.completePairing(invite.pairingCode, ack);

      await addFamilyMember({
        deviceId: invite.deviceId,
        role: "peer",
        displayName: invite.displayName,
        publicKeyJwk: b64JwkToPublicKeyJwk(invite.publicKeyJwkB64),
        pairingStatus: "connected",
        createdAt: new Date().toISOString(),
        pairedAt: new Date().toISOString(),
      });
      onError(null);
    } catch (err) {
      handleRelayErr(err, onError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-bold text-ink">Paste the invite text from the other phone.</p>
      <textarea
        className="h-24 w-full rounded-sm border-2 border-line bg-surface-2 px-3.5 py-3 text-sm font-medium text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-gold"
        placeholder="Paste the full invite text here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button className="w-full" loading={busy} disabled={busy} onClick={() => void accept()}>
        {busy ? "Pairing…" : "Accept pairing"}
      </Button>
      <p className="text-xs text-muted">
        One-time handshake. Once accepted, both phones can exchange encrypted orders without this
        code again.
      </p>
    </Card>
  );
}

function handleRelayErr(
  err: unknown,
  onError: (msg: string | null) => void,
): void {
  if (err instanceof RelayError && err.kind === "auth") {
    onError("This device was rejected by the relay. Check the relay URL in Settings and try again.");
  } else if (err instanceof RelayError) {
    onError("Could not reach the relay. Check the relay URL in Settings and try again.");
  } else {
    onError("Could not finish pairing — try again in a moment.");
  }
}