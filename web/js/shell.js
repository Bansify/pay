/*
 * Bansify shell for the Accounts dashboard.
 *
 * The same five cards as bansify.com, Mail and AI: the left panel, a search pill and the
 * social card above the content, the dashboard in the content card, and the app dock.
 * The dashboard's own nav buttons, theme toggle and account menu are still the controls
 * behind the shell, so no behaviour is reimplemented.
 */
(function () {
  'use strict';

  var SECTIONS = [
    { id: 'catalog', label: 'Plans', icon: 'sell' },
    { id: 'account', label: 'Your account', icon: 'person' },
  ];

  var APPS = [
    { label: 'Mail', icon: 'mail', url: 'https://mail.bansify.com' },
    { label: 'Drive', icon: 'hard_drive', url: 'https://drive.bansify.com' },
    { label: 'Meet', icon: 'videocam', url: 'https://meet.bansify.com' },
    { label: 'Pay', icon: 'payments', url: 'https://pay.bansify.com' },
    { label: 'AI', icon: 'auto_awesome', url: 'https://ai.bansify.com' },
    { label: 'Store', icon: 'storefront', url: 'https://store.bansify.com' },
    { label: 'GitPlus', icon: 'code', url: 'https://gitplus.bansify.com' },
  ];

  // Real brand marks, inlined so the card needs no icon font or network request.
  var BRAND_PATHS = {
    facebook: 'M13.5 21v-7h2.4l.4-2.8h-2.8V9.4c0-.8.2-1.4 1.4-1.4h1.5V5.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2H8v2.8h2.5v7h3z',
    instagram: 'M12 7.2A4.8 4.8 0 1 0 16.8 12 4.8 4.8 0 0 0 12 7.2zm0 7.9A3.1 3.1 0 1 1 15.1 12 3.1 3.1 0 0 1 12 15.1zM17 6.2a1.1 1.1 0 1 0 1.1 1.1A1.1 1.1 0 0 0 17 6.2zM12 4.6c1.9 0 2.2 0 3 .1a4 4 0 0 1 1.5.3 2.7 2.7 0 0 1 1.5 1.5 4 4 0 0 1 .3 1.5c0 .8.1 1.1.1 3s0 2.2-.1 3a4 4 0 0 1-.3 1.5 2.7 2.7 0 0 1-1.5 1.5 4 4 0 0 1-1.5.3c-.8 0-1.1.1-3 .1s-2.2 0-3-.1a4 4 0 0 1-1.5-.3 2.7 2.7 0 0 1-1.5-1.5 4 4 0 0 1-.3-1.5c0-.8-.1-1.1-.1-3s0-2.2.1-3a4 4 0 0 1 .3-1.5A2.7 2.7 0 0 1 7.5 5a4 4 0 0 1 1.5-.3c.8-.1 1.1-.1 3-.1z',
    youtube: 'M21.6 8.2a2.5 2.5 0 0 0-1.8-1.8C18.2 6 12 6 12 6s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8A26 26 0 0 0 2 12a26 26 0 0 0 .4 3.8 2.5 2.5 0 0 0 1.8 1.8C5.8 18 12 18 12 18s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-3.8zM10 15V9l5.2 3z',
    x: 'M17.5 4h2.9l-6.3 7.2L21.5 20h-5.8l-4.5-5.9L5.9 20H3l6.7-7.7L2.9 4h5.9l4.1 5.4zm-1 14.2h1.6L7.6 5.7H5.9z',
    linkedin: 'M6.9 8.6H4V20h2.9zM5.4 4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM20 13.6c0-3.2-1.7-4.7-4-4.7a3.4 3.4 0 0 0-3.1 1.7V8.6H10V20h2.9v-6a2 2 0 0 1 1.9-2.2c1.1 0 1.8.7 1.8 2.2v6H20z',
    telegram: 'M21.9 4.3 19 19.2c-.2 1-.8 1.2-1.6.8l-4.5-3.3-2.2 2.1c-.2.2-.5.4-.9.4l.3-4.6 8.4-7.6c.4-.3-.1-.5-.6-.2L7.6 13.3 3.2 12c-1-.3-1-1 .2-1.4l17-6.6c.8-.3 1.5.2 1.5 1.3z',
    github: 'M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z',
  };

  var SOCIAL = [
    { label: 'Facebook', brand: 'facebook', color: '#1877F2', url: 'https://facebook.com/bansifyofficial' },
    { label: 'Instagram', brand: 'instagram', color: '#E1306C', url: 'https://instagram.com/bansifyofficial' },
    { label: 'YouTube', brand: 'youtube', color: '#FF0000', url: 'https://youtube.com/@bansifyofficial' },
    { label: 'X', brand: 'x', color: '#0F1419', url: 'https://x.com/bansifyofficial' },
    { label: 'LinkedIn', brand: 'linkedin', color: '#0A66C2', url: 'https://linkedin.com/company/bansifyofficial' },
    { label: 'Telegram', brand: 'telegram', color: '#229ED9', url: 'https://t.me/bansifyofficial' },
    { label: 'GitHub', brand: 'github', color: '#181717', url: 'https://github.com/Bansify' },
  ];

  // The account centre sheet Accounts already publishes for every app. Opening it from the
  // shell means the avatar does the same thing here as it does on bansify.com and Mail.
  var sheetPromise = null;
  function loadAccountSheet() {
    if (sheetPromise) return sheetPromise;
    sheetPromise = import('https://accounts.bansify.com/widget/account-menu.js')
      .then(function (mod) {
        return mod || window.BansifyAccountMenu || window.GothwadAccountMenu || null;
      })
      .catch(function () {
        return null;
      });
    return sheetPromise;
  }

  function openAccountSheet() {
    loadAccountSheet().then(function (widget) {
      if (widget && typeof widget.open === 'function') {
        widget.open();
      } else {
        window.location.href = 'https://accounts.bansify.com/account';
      }
    });
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function sym(name) {
    return '<span class="msym">' + name + '</span>';
  }

  function selectSection(id) {
    var target = document.querySelector('.me-nav-item[data-section="' + id + '"]');
    if (target) target.click();
    syncActive(id);
  }

  function syncActive(id) {
    document.querySelectorAll('.bs-nav-item').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.section === id);
    });
  }

  function toggleTheme() {
    var toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) toggle.click();
    setTimeout(paintThemeIcon, 60);
  }

  function paintThemeIcon() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark');
    document.querySelectorAll('.bs-theme-inline').forEach(function (btn) {
      btn.innerHTML = sym(dark ? 'light_mode' : 'dark_mode');
    });
  }

  function openPane(app) {
    var existing = document.querySelector('.bs-pane');
    if (existing) existing.remove();

    var pane = el('section', 'bs-pane');
    pane.setAttribute('aria-label', app.label);

    var head = el('div', 'bs-pane-head');
    var mark = el('span', 'bs-dock-app', app.icon ? sym(app.icon) : '');
    if (app.logo) mark.innerHTML = '<img src="' + app.logo + '" alt="" />';
    head.appendChild(mark);
    head.appendChild(el('span', 'bs-pane-title', app.label));

    var open = el('a', 'bs-pane-btn', sym('open_in_new'));
    open.href = app.url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.title = 'Open in tab';
    open.setAttribute('aria-label', 'Open in a new tab');
    head.appendChild(open);

    var close = el('button', 'bs-pane-btn', sym('close'));
    close.type = 'button';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', function () {
      pane.remove();
      document.body.classList.remove('bs-has-pane');
    });
    head.appendChild(close);

    var frame = document.createElement('iframe');
    frame.src = app.url;
    frame.title = app.label;
    frame.loading = 'lazy';

    pane.appendChild(head);
    pane.appendChild(frame);
    document.body.appendChild(pane);
    document.body.classList.add('bs-has-pane');
  }

  function buildPanel() {
    var panel = el('aside', 'bs-panel');
    panel.setAttribute('aria-label', 'Account navigation');

    var brand = el('div', 'bs-brand');
    var mark = el('button', 'bs-brand-mark', '<img src="/icon-192.png" alt="Bansify Accounts" />');
    mark.type = 'button';
    mark.setAttribute('aria-label', 'Toggle panel');
    mark.addEventListener('click', function () {
      document.body.classList.toggle('bs-collapsed');
      try {
        localStorage.setItem('bs-shell-collapsed', document.body.classList.contains('bs-collapsed') ? '1' : '0');
      } catch (e) {}
    });
    brand.appendChild(mark);
    brand.appendChild(el('span', 'bs-brand-name', '<b>Bansify</b> Pay'));

    var collapse = el('button', 'bs-collapse', sym('chevron_left'));
    collapse.type = 'button';
    collapse.setAttribute('aria-label', 'Collapse panel');
    collapse.addEventListener('click', function () {
      document.body.classList.add('bs-collapsed');
      try {
        localStorage.setItem('bs-shell-collapsed', '1');
      } catch (e) {}
    });
    brand.appendChild(collapse);
    panel.appendChild(brand);

    var nav = el('nav', 'bs-nav');
    SECTIONS.forEach(function (section) {
      var btn = el('button', 'bs-nav-item', sym(section.icon) + '<span>' + section.label + '</span>');
      btn.type = 'button';
      btn.dataset.section = section.id;
      btn.title = section.label;
      btn.addEventListener('click', function () {
        selectSection(section.id);
      });
      nav.appendChild(btn);
    });
    panel.appendChild(nav);

    var footer = el('div', 'bs-footer');
    footer.appendChild(el('div', 'bs-divider'));

    var profile = el('button', 'bs-profile');
    profile.type = 'button';
    var avatar = el('span', 'bs-avatar', 'B');
    var text = el('span', 'bs-profile-text');
    var name = el('span', 'bs-profile-name', 'Account');
    var email = el('span', 'bs-profile-email', '');
    text.appendChild(name);
    text.appendChild(email);
    var theme = el('span', 'bs-theme-inline', sym('dark_mode'));
    theme.setAttribute('role', 'button');
    theme.setAttribute('tabindex', '0');
    theme.setAttribute('aria-label', 'Toggle theme');
    theme.addEventListener('click', function (event) {
      event.stopPropagation();
      toggleTheme();
    });
    profile.appendChild(avatar);
    profile.appendChild(text);
    profile.appendChild(theme);
    profile.addEventListener('click', openAccountSheet);
    footer.appendChild(profile);
    panel.appendChild(footer);

    function refreshProfile() {
      var srcAvatar = document.getElementById('appbar-avatar');
      var srcName = document.getElementById('menu-name');
      var srcEmail = document.getElementById('menu-email');
      var avatarText = ((srcAvatar && srcAvatar.textContent) || 'B').trim().slice(0, 1).toUpperCase() || 'B';
      var nameText = ((srcName && srcName.textContent) || 'Account').trim() || 'Account';
      var emailText = ((srcEmail && srcEmail.textContent) || '').trim();
      avatar.textContent = avatarText;
      name.textContent = nameText;
      email.textContent = emailText === '…' ? '' : emailText;
      var dockAvatar = document.querySelector('.bs-dock-avatar');
      if (dockAvatar) dockAvatar.textContent = avatarText;
    }
    refreshProfile();
    setInterval(refreshProfile, 2000);

    return panel;
  }

  function buildTop() {
    var top = el('div', 'bs-top');

    var search = el('div', 'bs-search', sym('search'));
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search account settings';
    input.setAttribute('aria-label', 'Search account settings');
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      document.querySelectorAll('.bs-nav-item').forEach(function (btn) {
        var label = (btn.textContent || '').toLowerCase();
        btn.style.display = !q || label.indexOf(q) !== -1 ? '' : 'none';
      });
    });
    search.appendChild(input);
    top.appendChild(search);

    var social = el('div', 'bs-social');
    SOCIAL.forEach(function (item) {
      var link = el(
        'a',
        null,
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="' +
          BRAND_PATHS[item.brand] +
          '"/></svg>'
      );
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = item.label + ' · @bansifyofficial';
      link.setAttribute('aria-label', item.label + ' @bansifyofficial');
      link.style.background = item.color;
      social.appendChild(link);
    });
    top.appendChild(social);

    return top;
  }

  function buildDock() {
    var dock = el('aside', 'bs-dock');
    dock.setAttribute('aria-label', 'Bansify apps');

    var avatar = el('button', 'bs-dock-avatar', 'B');
    avatar.type = 'button';
    avatar.setAttribute('aria-label', 'Account');
    avatar.addEventListener('click', openAccountSheet);
    dock.appendChild(avatar);
    dock.appendChild(el('div', 'bs-dock-divider'));

    APPS.forEach(function (app) {
      var button = el('button', 'bs-dock-app');
      button.type = 'button';
      button.title = app.label;
      button.setAttribute('aria-label', 'Open ' + app.label);
      var logo = app.url.replace(/\/+$/, '') + '/icon-192.png';
      var img = document.createElement('img');
      img.src = logo;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function () {
        button.innerHTML = sym(app.icon);
      };
      button.appendChild(img);
      app.logo = logo;
      button.addEventListener('click', function () {
        openPane(app);
      });
      dock.appendChild(button);
      dock.appendChild(el('div', 'bs-dock-divider'));
    });

    return dock;
  }

  function init() {
    var root = document.getElementById('view');
    if (!root) return;

    document.body.classList.add('bs-shell-on');
    document.body.appendChild(buildPanel());
    document.body.appendChild(buildTop());
    document.body.appendChild(buildDock());

    try {
      if (localStorage.getItem('bs-shell-collapsed') === '1') {
        document.body.classList.add('bs-collapsed');
      }
    } catch (e) {}

    document.querySelectorAll('.me-nav-item[data-section]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        syncActive(btn.dataset.section);
      });
    });
    syncActive('catalog');
    var splash = document.getElementById('bs-splash');
    if (splash) splash.remove();
    loadAccountSheet();
    paintThemeIcon();
    setInterval(paintThemeIcon, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
