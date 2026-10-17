// Preserve access to already configured installations; never rename or recreate their data.
export function isLocalDatabase(pathname) {
  return /^\/(?:oryx|valkyr)(?:_(?:demo|restore)_[a-z0-9_]+)?$/.test(pathname);
}
export function isDemoDatabase(pathname) {
  return /^\/(?:oryx|valkyr)_demo_\d+$/.test(pathname);
}
