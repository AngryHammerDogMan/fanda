(function () {
  var picks = Array.prototype.slice.call(document.querySelectorAll('.pick'));
  var screens = Array.prototype.slice.call(document.querySelectorAll('.studio-stage .phone-screen'));

  function activate(targetId) {
    picks.forEach(function (pick) {
      pick.classList.toggle('active', pick.getAttribute('data-target') === targetId);
    });
    screens.forEach(function (screen) {
      screen.classList.toggle('active', screen.id === targetId);
    });
  }

  picks.forEach(function (pick) {
    pick.addEventListener('click', function () {
      activate(pick.getAttribute('data-target'));
    });
  });
})();
