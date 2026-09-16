import { Component, type ReactNode } from 'react';

interface Props {
  /** Rendered in place of the broken subtree. Required, because there is no
   *  sensible default: this boundary sits INSIDE a `<Canvas>`, where plain HTML
   *  is not a valid child (it would throw again and take the whole page down).
   *  Callers pass a drei `<Html>`, or `null` if silence is preferable. */
  fallback: ReactNode;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Keeps a missing STL from taking the page with it.
 *
 * `useLoader` resolves through `suspend-react`, which caches a load failure and
 * rethrows it on every render. `<Suspense>` only catches the promise a loader
 * suspends with, so it does not catch that — React 19 unmounts the tree instead
 * and the user gets a white page with no clue why. An error boundary is the only
 * thing that stops it.
 *
 * The repo had none before this. It matters more now than it did: `/kits` used to
 * reach exactly one STL (`profile_3030`), and the profile picker puts all three
 * plus the connector's own mesh behind the same page.
 *
 * Deliberately not routed through `modelStore.setError`: this scene is documented
 * as standalone, so that opening the editor cannot disturb the other two modes.
 * The failure is reported where the missing geometry would have been, and to the
 * console.
 */
export default class ProfileBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[kits] the assembly model failed to load', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
