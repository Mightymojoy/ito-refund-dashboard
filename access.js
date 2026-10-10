'use strict';
(() => {
  const form = document.getElementById('access-form');
  const input = document.getElementById('access-password');
  const error = document.getElementById('access-error');
  const button = document.getElementById('access-submit');
  let material = null, current = null, revision = null;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  async function request(path) {
    const response = await fetch(new URL(path, document.baseURI), {cache: 'no-store'});
    if (!response.ok) throw new Error('线上数据暂时无法读取，请稍后重试。');
    return response.json();
  }
  async function getManifest() {
    const manifest = await request('./manifest.json?t=' + Date.now());
    if (manifest.format !== 'ito-encrypted-dashboard-v1' ||
        !/^data\/dashboard\.[a-f0-9]{64}\.enc\.json$/.test(manifest.dataset)) {
      throw new Error('线上数据格式不受支持。');
    }
    return manifest;
  }
  async function decrypt(manifest, passwordKey) {
    const bundle = await request('./' + manifest.dataset);
    if (bundle.format !== 'ito-encrypted-dashboard-v1' || bundle.iterations < 100000 || bundle.iterations > 1500000) {
      throw new Error('加密数据格式不受支持。');
    }
    const key = await crypto.subtle.deriveKey(
      {name:'PBKDF2', hash:'SHA-256', salt:decode(bundle.salt), iterations:bundle.iterations},
      passwordKey, {name:'AES-GCM', length:256}, false, ['decrypt']);
    let compressed;
    try { compressed = await crypto.subtle.decrypt({name:'AES-GCM', iv:decode(bundle.iv)}, key, decode(bundle.ciphertext)); }
    catch { throw new Error('访问密码不正确，或管理员已更新密码。'); }
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const data = JSON.parse(await new Response(stream).text());
    if (data.version !== 1 || !Array.isArray(data.facts)) throw new Error('看板数据格式不受支持。');
    return data;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); error.textContent = ''; button.disabled = true; button.textContent = '正在解锁…';
    try {
      if (!crypto.subtle || !window.DecompressionStream) throw new Error('请使用新版 Chrome、Edge 或 Safari 打开 HTTPS 看板网址。');
      const candidate = await crypto.subtle.importKey('raw', new TextEncoder().encode(input.value), 'PBKDF2', false, ['deriveKey']);
      const manifest = await getManifest();
      const data = await decrypt(manifest, candidate);
      material = candidate; current = data; revision = manifest.revision; input.value = '';
      document.body.classList.remove('access-locked'); document.getElementById('access-gate').hidden = true;
      resolveReady();
    } catch (err) { error.textContent = err.message; input.focus(); }
    finally { button.disabled = false; button.textContent = '解锁看板'; }
  });
  window.githubDashboard = {load: async () => {
    await ready;
    const manifest = await getManifest();
    if (manifest.revision !== revision) {
      const data = await decrypt(manifest, material);
      current = data; revision = manifest.revision;
    }
    return current;
  }};
  document.getElementById('logout').addEventListener('click', () => { material=null; current=null; location.reload(); });
})();
