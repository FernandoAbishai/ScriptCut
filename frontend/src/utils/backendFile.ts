export function buildBackendFileUrl(backendUrl: string, path?: string, capability?: string) {
  if (!path || !capability) return '';
  return `${backendUrl}/file?path=${encodeURIComponent(path)}&cap=${encodeURIComponent(capability)}`;
}

export async function resolveBackendFileUrl(
  backendUrl: string,
  path: string,
  capability?: string,
): Promise<string> {
  if (window.electronAPI?.getBackendFileUrl) {
    return window.electronAPI.getBackendFileUrl(path);
  }
  const url = buildBackendFileUrl(backendUrl, path, capability);
  if (!url) throw new Error('The local media file is missing its read capability.');
  return url;
}
