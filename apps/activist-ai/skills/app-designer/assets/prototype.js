// app-designer: makes prototype.html clickable. One screen shows at a time.
//   data-go="id"   open that screen (pushes it; back returns)
//   data-back      back to the screen before
//   data-tab="id"  switch tab (the tab bar marks the current one); a screen names its tab with data-tab-of="id"
//   data-tabbar="hide" on a screen hides the tab bar there (sheets, full-screen tasks)
// The first screen is window.OLA_SCREEN (set by screens.py), the address's #id, or the first in the file.
(() => {
  const screens = [...document.querySelectorAll('.screen')]
  if (!screens.length) return
  const stack = []
  const tabbar = document.querySelector('.tabbar')
  function show(id, push) {
    const next = document.getElementById(id)
    if (!next || !next.classList.contains('screen')) return
    const cur = screens.find((s) => !s.hidden)
    if (push && cur && cur !== next) stack.push(cur.id)
    const sheet = next.classList.contains('sheet')
    for (const s of screens) s.hidden = !(s === next || (sheet && cur && s === cur && !cur.classList.contains('sheet')))
    const tab = next.dataset.tabOf || (cur && sheet ? cur.dataset.tabOf || cur.id : next.id)
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false')
    if (tabbar) tabbar.hidden = next.dataset.tabbar === 'hide'
    next.scrollTop = 0
    if (history.replaceState) history.replaceState(null, '', '#' + id)
  }
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]'), back = e.target.closest('[data-back]'), tab = e.target.closest('[data-tab]')
    if (go) { e.preventDefault(); show(go.dataset.go, true) }
    else if (back) { e.preventDefault(); show(stack.pop() || screens[0].id, false) }
    else if (tab) { e.preventDefault(); stack.length = 0; show(tab.dataset.tab, false) }
  })
  show(window.OLA_SCREEN || decodeURIComponent(location.hash.slice(1)) || screens[0].id, false)
})()
