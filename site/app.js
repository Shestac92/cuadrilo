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
