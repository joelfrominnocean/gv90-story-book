import { Component, type ReactNode } from "react";

/** If the 3D scene throws (no WebGL context, lost device), fall back to the 2D book instead of a blank screen. */
export class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("3D book failed; using the 2D book.", err);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
