/**
 * JSONP helper used to call Deezer's API from the browser without a backend.
 *
 * Deezer's public endpoints accept `?output=jsonp&callback={name}` and respond
 * with `{name}({...})`. We inject a `<script>` tag pointing at the URL with a
 * unique callback name; the response invokes the callback we registered on
 * `window`, fulfilling the promise. CORS is not required.
 */

let cbId = 0;

export function jsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__cb_${Date.now()}_${cbId++}`;
    const sep = url.includes('?') ? '&' : '?';
    const full = `${url}${sep}output=jsonp&callback=${name}`;
    const script = document.createElement('script');
    let timer: ReturnType<typeof setTimeout> | null = null;

    (window as unknown as Record<string, (data: unknown) => void>)[name] = (data: unknown) => {
      cleanup();
      const d = data as { error?: { message?: string } } | undefined;
      if (d && d.error) {
        reject(new Error(d.error.message || 'Deezer API error'));
        return;
      }
      resolve(data as T);
    };
    script.src = full;
    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP failed: ' + full));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout: ' + full));
    }, 12000);

    function cleanup() {
      if (timer) clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)[name];
      script.remove();
    }
    document.head.appendChild(script);
  });
}
