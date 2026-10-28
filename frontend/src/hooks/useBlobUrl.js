import { useEffect, useState } from 'react';

// A private file (it needs the signed-in token, so an <img src> cannot load it) as an object URL for display.
// load() -> Promise<{ blob }>; it runs again when `key` changes. -> the URL, or null while loading / when there is no file / on failure.
export function useBlobUrl(key, load) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!key) { setUrl(null); return undefined; }
    let objectUrl = null;
    let live = true;
    load().then(({ blob }) => {
      if (!live) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (live) setUrl(null); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}
