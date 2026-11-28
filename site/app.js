// Demo: dropdown gaps. A choice is checked at once: right turns green, wrong turns red and can be changed.
(() => {
  var gaps = document.querySelectorAll('select.gap');
  var status = document.getElementById('gaps-status');
  gaps.forEach((select) => {
    select.addEventListener('change', () => {
      var ok = select.value === select.getAttribute('data-answer');
      select.classList.toggle('ok', ok);
      select.classList.toggle('bad', !ok);
      var done = 0;
      gaps.forEach((g) => {
        if (g.classList.contains('ok')) done++;
      });
      status.textContent = done === gaps.length ? 'All right!' : '';
    });
  });
})();

// Demo: choice. Checked at once: the right option turns green, a wrong one red and the student can try again.
(() => {
  var box = document.getElementById('choice');
  var status = document.getElementById('choice-status');
  var options = box.querySelectorAll('.opt');
  options.forEach((option) => {
    option.addEventListener('click', () => {
      var right = option.getAttribute('data-correct') === 'true';
      options.forEach((o) => {
        o.classList.remove('ok', 'bad');
      });
      option.classList.add(right ? 'ok' : 'bad');
      status.textContent = right ? 'Right!' : 'Not quite, try again.';
    });
  });
})();

// The demo app: the main button downloads the version for the visitor's system, and the download card of that
// system is marked. On a phone, a tablet or Linux it stays a link to the downloads. Every download first shows how
// to open the app the first time (the dialog #first-run): the file comes only with "Got it, download".
(() => {
  var labels = {
    'mac-arm64': ['Download the demo for Mac', 'Apple silicon · free'],
    'mac-x64': ['Download the demo for Mac', 'Intel · free'],
    'win-x64': ['Download the demo for Windows', 'Windows 10 and 11 · free'],
  };

  async function detect() {
    const data = navigator.userAgentData;
    const platform = data?.platform || navigator.platform || '';
    // iPadOS Safari says "MacIntel": a Mac has no touch screen.
    const mobile =
      data?.mobile ||
      /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (/Mac/.test(platform) && navigator.maxTouchPoints > 1);
    if (mobile) return null;
    // Windows on ARM runs the x64 version.
    if (/Win/i.test(platform)) return 'win-x64';
    if (!/Mac/i.test(platform)) return null;
    // Chrome and Edge tell the processor; Safari and Firefox do not: Apple silicon, the Macs of now.
    if (data?.getHighEntropyValues) {
      try {
        const values = await data.getHighEntropyValues(['architecture']);
        if (values.architecture === 'x86') return 'mac-x64';
      } catch (_error) {
        // Not told: Apple silicon.
      }
    }
    return 'mac-arm64';
  }

  var main = document.getElementById('demo-main');
  var band = document.getElementById('demo');
  if (!main || !band) return;
  detect().then((os) => {
    var card = os && band.querySelector(`.download[data-os="${os}"]`);
    if (!card) return;
    card.classList.add('mine');
    main.href = card.href;
    main.dataset.os = os;
    document.getElementById('demo-main-label').textContent = labels[os][0];
    document.getElementById('demo-main-sub').textContent = labels[os][1];
  });

  const dialog = document.getElementById('first-run');
  const state = document.getElementById('first-run-state');
  const download = document.getElementById('first-run-download');
  const again = document.getElementById('first-run-again');
  if (!dialog?.showModal) return; // Without <dialog>: the links download at once.

  function openFirstRun(link) {
    dialog.dataset.os = link.dataset.os.startsWith('mac') ? 'mac' : 'win';
    dialog.dataset.portable = link.dataset.portable === 'true' ? 'true' : 'false';
    dialog.classList.remove('started');
    state.textContent = 'Before you download';
    download.textContent = 'Got it, download';
    download.href = link.href;
    again.href = link.href;
    dialog.showModal();
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-os]');
    if (!link || link.closest('dialog')) return;
    event.preventDefault();
    openFirstRun(link);
  });
  // The first click downloads (the link itself) and the steps stay open to read; the second closes.
  download.addEventListener('click', (event) => {
    if (dialog.classList.contains('started')) {
      event.preventDefault();
      dialog.close();
      return;
    }
    dialog.classList.add('started');
    state.textContent = 'Download started';
    download.textContent = 'Done';
  });
  document.getElementById('first-run-cancel').addEventListener('click', () => dialog.close());
  // A click on the backdrop (outside the box; its own padding is the dialog too) closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom;
    if (!inside) dialog.close();
  });
})();
