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

function runCreatorQualificationProbe(window, { backendOrigin, mediaPath, outputPath, projectPath }) {
  const probe = async ({ origin, fixturePath, exportPath, roundTripProjectPath }) => {
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
        return { status: response.status, body: body.slice(0, 1000), bodyBytes };
      } catch (error) {
        return { status: 0, error: String(error), bodyBytes: 0 };
      }
    }

    async function requestJson(url, options) {
      const response = await request(url, options);
      let json = null;
      if (response.body) {
        try {
          json = JSON.parse(response.body);
        } catch {
          // The caller reports the HTTP/body context if JSON was expected.
        }
      }
      return { ...response, json };
    }

    async function waitForExport(jobId) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 30000) {
        const response = await requestJson(`${origin}/jobs/${encodeURIComponent(jobId)}`);
        if (response.status !== 200 || !response.json) {
          throw new Error(`export job status returned ${response.status}: ${response.body || response.error || ''}`);
        }
        if (response.json.status === 'succeeded') return response.json;
        if (response.json.status === 'failed' || response.json.status === 'canceled') {
          throw new Error(response.json.error || response.json.message || `export job ${response.json.status}`);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      throw new Error('export job timed out');
    }

    async function inspectVideo(url) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.src = url;
      document.body.appendChild(video);
      try {
        return await new Promise((resolve) => {
          let settled = false;
          const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
          };
          video.addEventListener('loadedmetadata', () => finish({
            loaded: true,
            duration: Number.isFinite(video.duration) ? video.duration : 0,
            width: video.videoWidth,
            height: video.videoHeight,
          }), { once: true });
          video.addEventListener('error', () => finish({
            loaded: false,
            error: video.error?.message || `media error code ${video.error?.code || 0}`,
          }), { once: true });
          window.setTimeout(() => finish({ loaded: false, error: 'metadata load timed out' }), 5000);
          video.load();
        });
      } finally {
        video.remove();
      }
    }

    const project = {
      app: 'ScriptCut',
      schema: 'scriptcut.project.v1',
      version: 1,
      videoPath: fixturePath,
      words: [
        { word: 'creator', start: 0.2, end: 0.7, confidence: 1 },
        { word: 'qualification', start: 0.7, end: 1.3, confidence: 1 },
      ],
      segments: [],
      deletedRanges: [],
      editOperations: [],
      aiWorkspace: { clipSuggestions: [], clipDrafts: [], clipReviewDecisions: {} },
      language: 'en',
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
    };
    const projectText = `${JSON.stringify(project, null, 2)}\n`;

    const writeResult = await window.electronAPI.writeProjectFile(roundTripProjectPath, projectText);
    if (writeResult !== true) throw new Error('project write IPC did not confirm success');
    const readBack = await window.electronAPI.readProjectFile(roundTripProjectPath);
    if (readBack !== projectText) throw new Error('project write/read IPC round-trip changed project content');

    // Project reads approve only their referenced media for this trusted renderer.
    // Use that existing capability path rather than bypassing the main-process allowlist.
    const sourceUrl = await window.electronAPI.getBackendFileUrl(fixturePath);
    const sourceResponse = await request(sourceUrl);
    if (sourceResponse.status !== 200 || sourceResponse.bodyBytes <= 0) {
      throw new Error(`project-approved source media returned ${sourceResponse.status} with ${sourceResponse.bodyBytes} bytes`);
    }

    const checks = await request(`${origin}/system/checks`);
    if (checks.status !== 200) throw new Error(`authenticated system checks returned ${checks.status}: ${checks.body || checks.error || ''}`);

    const start = await requestJson(`${origin}/jobs/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_path: fixturePath,
        output_path: exportPath,
        keep_segments: [{ start: 0.2, end: 1.8 }],
        mode: 'reencode',
        resolution: '720p',
        aspectRatio: 'source',
        format: 'mp4',
        enhanceAudio: false,
        captions: 'none',
      }),
    });
    if (start.status !== 200 || typeof start.json?.job_id !== 'string') {
      throw new Error(`export job did not start (${start.status}): ${start.body || start.error || ''}`);
    }

    const job = await waitForExport(start.json.job_id);
    const result = job.result || {};
    if (typeof result.output_path !== 'string' || !result.output_path) {
      throw new Error('export completed without an output path');
    }
    if (typeof result.file_capability !== 'string' || !result.file_capability) {
      throw new Error('export completed without a file capability');
    }

    const deniedUrl = `${origin}/file?path=${encodeURIComponent(result.output_path)}&cap=invalid-smoke-capability`;
    const deniedOutput = await request(deniedUrl);
    if (deniedOutput.status !== 403) {
      throw new Error(`export output accepted an invalid file capability (${deniedOutput.status})`);
    }

    const outputUrl = `${origin}/file?path=${encodeURIComponent(result.output_path)}&cap=${encodeURIComponent(result.file_capability)}`;
    const outputResponse = await request(outputUrl);
    if (outputResponse.status !== 200 || outputResponse.bodyBytes <= 0) {
      throw new Error(`capability-authorized export returned ${outputResponse.status} with ${outputResponse.bodyBytes} bytes`);
    }
    const playback = await inspectVideo(outputUrl);
    if (!playback.loaded || playback.duration <= 0 || playback.width <= 0 || playback.height <= 0) {
      throw new Error(`renderer could not load exported video metadata: ${JSON.stringify(playback)}`);
    }
    if (policyViolations.length > 0) {
      throw new Error(`renderer reported CSP violations: ${JSON.stringify(policyViolations)}`);
    }

    return {
      checks: { status: checks.status },
      project: { roundTrip: true, bytes: projectText.length },
      source: { status: sourceResponse.status, bodyBytes: sourceResponse.bodyBytes },
      export: {
        jobStatus: job.status,
        outputPath: result.output_path,
        bodyBytes: outputResponse.bodyBytes,
        deniedCapabilityStatus: deniedOutput.status,
      },
      playback,
      policyViolations,
    };
  };

  const args = {
    origin: backendOrigin,
    fixturePath: mediaPath,
    exportPath: outputPath,
    roundTripProjectPath: projectPath,
  };
  return window.webContents.executeJavaScript(`(${probe.toString()})(${JSON.stringify(args)})`, true);
}

async function runCreatorQualificationSmoke({ window, backendOrigin, mediaPath, outputPath, projectPath }) {
  await waitForLoad(window);
  return runCreatorQualificationProbe(window, {
    backendOrigin,
    mediaPath,
    outputPath,
    projectPath,
  });
}

module.exports = { runCreatorQualificationSmoke };
