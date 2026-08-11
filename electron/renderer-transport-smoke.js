function waitForLoad(window) {
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onFail = (_event, code, description) => {
      cleanup();
      reject(new Error(`renderer failed to load (${code}): ${description}`));
    };
    const cleanup = () => {
      window.webContents.removeListener('did-finish-load', onLoad);
      window.webContents.removeListener('did-fail-load', onFail);
    };
    window.webContents.once('did-finish-load', onLoad);
    window.webContents.once('did-fail-load', onFail);
  });
}

function runRendererProbe(window, backendOrigin, mediaPath) {
  const probe = async ({ origin, fixturePath }) => {
    const policyViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      policyViolations.push({
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
      });
    });

    async function request(url, options) {
      try {
        const response = await fetch(url, options);
        const bodyBytes = (await response.clone().arrayBuffer()).byteLength;
        const body = await response.text();
        return { status: response.status, body: body.slice(0, 500), bodyBytes };
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    }

    const checks = await request(`${origin}/system/checks`);
    const transcription = await request(`${origin}/jobs/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_path: '/scriptcut-renderer-transport-missing.mp4',
        engine: 'whisper',
        model: 'base',
        use_gpu: false,
        use_cache: false,
      }),
    });

    const mediaUrl = `${origin}/file?path=${encodeURIComponent(fixturePath)}`;
    const media = await request(mediaUrl);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = mediaUrl;
    document.body.appendChild(video);
    video.load();
    await new Promise((resolve) => {
      const finish = () => {
        window.setTimeout(resolve, 100);
      };
      video.addEventListener('loadedmetadata', finish, { once: true });
      video.addEventListener('error', finish, { once: true });
      window.setTimeout(resolve, 1000);
    });
    video.remove();

    return {
      checks,
      transcription,
      media: { status: media.status, bodyBytes: media.bodyBytes || 0 },
      policyViolations,
    };
  };

  const script = `(${probe.toString()})(${JSON.stringify({ origin: backendOrigin, fixturePath: mediaPath })})`;
  return window.webContents.executeJavaScript(script, true);
}

async function runRendererTransportSmoke({ window, backendOrigin, mediaPath }) {
  await waitForLoad(window);
  const result = await runRendererProbe(window, backendOrigin, mediaPath);
  if (result.checks?.status !== 200) {
    throw new Error(`renderer GET /system/checks returned ${result.checks?.status || 0}: ${result.checks?.error || result.checks?.body || ''}`);
  }
  if (!result.transcription || result.transcription.status <= 0) {
    throw new Error(`renderer POST /jobs/transcribe was not an HTTP response: ${result.transcription?.error || 'unknown error'}`);
  }
  if (result.media?.status !== 200 || result.media.bodyBytes <= 0) {
    throw new Error(`renderer media request returned ${result.media?.status || 0} with ${result.media?.bodyBytes || 0} bytes`);
  }
  if (result.policyViolations.length > 0) {
    throw new Error(`renderer reported CSP violations: ${JSON.stringify(result.policyViolations)}`);
  }
  return result;
}

module.exports = { runRendererTransportSmoke };
