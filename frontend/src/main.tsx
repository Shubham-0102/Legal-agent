import { Component, ReactNode, ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

type BoundaryState = { error: Error | null; componentStack: string };
class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, componentStack: "" };
  static getDerivedStateFromError(error: Error): Partial<BoundaryState> { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render failed", error, info);
    this.setState({ componentStack: info.componentStack || "" });
  }
  render() {
    if (this.state.error) return <main style={{ maxWidth: 760, margin: "8vh auto", padding: 24, fontFamily: "sans-serif", color: "#26332b" }}>
      <h1>The app hit a display error</h1>
      <p>{this.state.error.message || String(this.state.error) || "An unexpected error interrupted the page."}</p>
      <button onClick={() => location.reload()}>Reload the app</button>
      <details style={{ marginTop: 20 }} open>
        <summary>Error details (copy this if you contact support)</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{this.state.error.stack}{this.state.componentStack}</pre>
      </details>
    </main>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(<AppErrorBoundary><App /></AppErrorBoundary>);
