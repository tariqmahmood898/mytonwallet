import { IS_DESKTOP, IS_MOBILE, platform, onContentReady } from "/common.js";

const REPO = 'mytonwallet-org/mytonwallet';
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const LATEST_RELEASE_WEB_URL = `https://github.com/${REPO}/releases/latest`;
const LATEST_RELEASE_DOWNLOAD_URL = `https://github.com/${REPO}/releases/download/v%VERSION%`;
const WEB_APP_URL = '/';
const MOBILE_URLS = {
  ios: '/ios',
  android: '/android-store',
  androidDirect: `${LATEST_RELEASE_DOWNLOAD_URL}/MyTonWallet.apk`,
};
const BACKEND_API_URL = 'https://api.mytonwallet.org';

const processReferrer = (async () => {
  const referrer = new URLSearchParams(window.location.search).get('r');

  if (referrer) {
    await fetch(`${BACKEND_API_URL}/referrer/save`, {
      method: 'POST',
      body: JSON.stringify({ referrer }),
      headers: { 'Content-Type': 'application/json' },
    });
  }
})().catch(() => undefined);

const currentPage = location.href.includes('/android')
  ? 'android'
  : location.href.includes('/mac')
    ? 'mac'
    : location.href.includes('/rate')
      ? 'rate'
      : location.href.includes('/mobile')
        ? 'mobile'
        : location.href.includes('/desktop')
          ? 'desktop'
          : 'index';

// Request the latest release information from GitHub
const packagesPromise = fetch(LATEST_RELEASE_API_URL)
  .then(response => response.json())
  .then(data => {
    return data.assets.reduce((acc, {
      name,
      browser_download_url,
    }) => {
      let key;

      if (name.endsWith('.exe')) {
        key = 'win';
      } else if (name.endsWith('.AppImage')) {
        key = 'linux';
      } else if (name.endsWith('.dmg')) {
        key = `mac-${name.includes('arm') ? 'arm' : 'x64'}`;
      } else if (name.endsWith('.exe.asc')) {
        key = 'win-signature';
      } else if (name.endsWith('.AppImage.asc')) {
        key = 'linux-signature';
      } else if (name.endsWith('.dmg.asc')) {
        key = `mac-${name.includes('arm') ? 'arm' : 'x64'}-signature`;
      }

      if (key) {
        acc[key] = browser_download_url;
      }

      return acc;
    }, {
      $version: data.name,
    });
  })
  .catch((error) => {
    console.error('Error:', error);
  });

(function init() {
  if (currentPage === 'rate') {
    setupRateButtons();
    onContentReady();
    return;
  }

  // Handling subpages /get/desktop and /get/mobile
  const isTargetPlatform = (currentPage === 'mobile' && IS_MOBILE) || (currentPage === 'desktop' && IS_DESKTOP);
  if (isTargetPlatform) {
    // If we are on the target platform, redirect to the universal page
    void redirectToUniversalPage();
    return;
  }

  if (currentPage === 'mobile') {
    // Version is only needed for /get/mobile
    setupVersion();
  }

  if (currentPage === 'index') {
    if (['Windows', 'Linux', 'iOS'].includes(platform)) {
      setupDownloadButton();
    } else if (platform === 'Android') {
      void redirectToAndroid();
      return;
    } else if (platform === 'macOS') {
      void redirectToMac();
      return;
    }
  }

  setupVersion();
  onContentReady();
}());

function $(id) {
  return document.getElementById(id);
}

function setupDownloadButton() {
  document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.querySelector('.download-btn');
    downloadBtn.append(` for ${platform}`);
  });
}

function setupVersion() {
  document.addEventListener('DOMContentLoaded', () => {
    Promise.all([packagesPromise, areSignaturesPresent()]).then(([packages, areSignaturesPresentResult]) => {
      const versionEl = document.querySelector('.version');

      versionEl.append(`v. ${packages.$version}`);

      if (currentPage !== "mobile" && IS_DESKTOP) {
        versionEl.append(' · ');

        if (areSignaturesPresentResult) {
          const element = document.createElement('a');
          element.href = 'javascript:redirectToFullList();';
          element.textContent = 'Signatures';
          versionEl.append(element);
        } else {
          const element = document.createElement('span');
          element.className = 'missing-signatures';
          element.textContent = 'Missing signatures!';
          versionEl.append(element);
        }
      }
    });
  });
}

function redirectToUniversalPage() {
  return redirectTo('./');
}

function redirectToAndroid() {
  return redirectTo('./android');
}

function redirectToMac() {
  return redirectTo('./mac');
}

function redirectToWeb() {
  return redirectTo(WEB_APP_URL);
}

function redirectToFullList() {
  return redirectTo(LATEST_RELEASE_WEB_URL);
}

function redirectToStore(platform) {
  return redirectTo(MOBILE_URLS[platform.toLowerCase()]);
}

async function redirectTo(path) {
  await processReferrer;
  location.href = path;
}

function downloadDefault() {
  if (platform === 'Windows') {
    download('win');
  } else if (platform === 'Linux') {
    download('linux');
  } else if (platform === 'Android') {
    redirectToAndroid();
  } else if (platform === 'macOS') {
    redirectToMac();
  } else if (platform === 'iOS' || platform === 'Android') {
    redirectToStore(platform);
  }
}

function downloadAndroidDirect() {
  packagesPromise.then((packages) => {
    location.href = MOBILE_URLS.androidDirect.replace('%VERSION%', packages.$version);
  });
}

function download(platformKey) {
  packagesPromise.then((packages) => {
    location.href = packages[platformKey];
  });
}

function areSignaturesPresent() {
  return packagesPromise.then((packages) => {
    if (platform === 'Windows') return !!packages['win-signature'];
    if (platform === 'Linux') return !!packages['linux-signature'];
    if (platform === 'macOS') return !!(packages['mac-arm-signature'] && packages['mac-x64-signature']);
  });
}

function setupRateButtons() {
  $('vote-certik').classList.remove('hidden');

  const rand = Math.random();
  if (rand < 0.5) {
    Array.from(document.body.querySelectorAll('.store')).forEach((btnEl) => {
      btnEl.classList.remove('hidden');
    });

    if (platform === 'iOS') {
      $('rate-google-play').classList.add('secondary-btn');
      $('rate-chrome-web-store').classList.add('secondary-btn');
    } else if (platform === 'Android') {
      $('rate-app-store').classList.add('secondary-btn');
      $('rate-chrome-web-store').classList.add('secondary-btn');
    } else {
      $('rate-app-store').classList.add('secondary-btn');
      $('rate-google-play').classList.add('secondary-btn');
    }
  } else {
    // Hide store buttons
    Array.from(document.body.querySelectorAll('.non-store')).forEach((btnEl) => {
      btnEl.classList.remove('hidden');
    });
  }
}

const actions = {
  redirectToStore,
  downloadAndroidDirect,
  redirectToFullList,
  downloadDefault,
  download,
};

for (const action of Object.keys(actions)) {
  window[action] = actions[action];
}
