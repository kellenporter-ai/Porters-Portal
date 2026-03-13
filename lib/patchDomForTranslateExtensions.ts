/**
 * Patch DOM methods to prevent crashes caused by browser translation extensions.
 *
 * Google Translate (and similar extensions) replace text nodes with <font> elements.
 * When React later tries to removeChild/insertBefore on the original text node,
 * it throws "NotFoundError: Failed to execute 'removeChild' on 'Node'" because
 * the node is no longer a child of the expected parent.
 *
 * This patch makes removeChild and insertBefore gracefully handle that case
 * instead of throwing, which prevents React from crashing the entire app.
 *
 * Call once before ReactDOM.createRoot().
 */
export function patchDomForTranslateExtensions(): void {
  if (typeof window === 'undefined') return;

  const originalRemoveChild = Node.prototype.removeChild;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      // The child was moved/replaced by a translation extension.
      // Try to remove it from its actual parent so the DOM stays tidy.
      if (child.parentNode) {
        return originalRemoveChild.call(child.parentNode, child) as T;
      }
      // Already detached — nothing to do.
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, refNode: Node | null): T {
    if (refNode && refNode.parentNode !== this) {
      // Reference node was moved/replaced by a translation extension.
      // Fall back to appendChild so the insert still succeeds.
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, refNode) as T;
  };
}
