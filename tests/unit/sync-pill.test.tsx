import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncPill } from "../../src/components/ui/SyncPill";

describe("SyncPill state derivation", () => {
  it("shows 'Waiting for connection' only when nothing has synced and no peer is paired", () => {
    render(<SyncPill syncing={false} failed={0} connected={false} hasRun={false} />);
    expect(screen.getByText("Waiting for connection")).toBeTruthy();
  });

  it("shows 'Connected' once a peer is paired, even before any message has flowed", () => {
    render(<SyncPill syncing={false} failed={0} connected={true} hasRun={false} />);
    expect(screen.queryByText("Waiting for connection")).toBeNull();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.queryByText("Synced")).toBeNull();
  });

  it("shows 'Synced' once a run has delivered messages", () => {
    render(<SyncPill syncing={false} failed={0} connected={true} hasRun={true} />);
    expect(screen.getByText("Synced")).toBeTruthy();
  });

  it("keeps the failure state visible over a healthy connection", () => {
    render(<SyncPill syncing={false} failed={2} connected={true} hasRun={true} />);
    expect(screen.getByText("Sync delayed")).toBeTruthy();
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("shows the syncing spinner instead of any idle label", () => {
    render(<SyncPill syncing={true} failed={0} connected={true} hasRun={true} />);
    expect(screen.getByText("Syncing…")).toBeTruthy();
    expect(screen.queryByText("Waiting for connection")).toBeNull();
  });
});