# WebExtension Keyboard API proposals

This repository contains [WebExtension] API proposals related to keyboard
handling.

Bugzilla: [Bug 1215061 - Better keyboard shortcut support][bug-1215061]


## Motivation

- Allow creating add-ons whose purpose is to customize Firefox’s own keyboard
  shortcuts. Current add-ons that do this:

  - [Menu Wizard] \(Promoted here: https://support.mozilla.org/kb/keyboard-shortcuts-perform-firefox-tasks-quickly)
  - [Keybinder]
  - [keyconfig] \(See also: https://addons.mozilla.org/firefox/addon/dorando-keyconfig/)

- Allow creating add-ons that provide a different way of doing keyboard
  shortcuts. Current add-ons that do this:

  - [VimFx]
  - [Vimperator]
  - [Pentadactyl]

The main motivation is to make it possible to convert VimFx to a WebExtension.

I’ve thought hard about the problem, and gone through many API ideas. I think
that the proposed APIs strike a good balance between general usability,
simplicity (in terms of usage and maintenance) and security.

(While the proposed APIs provide the missing parts for VimFx, don’t expect them
to be enough for Vimperator and Pentadactyl as well. I think these APIs should
be usable for those extensions, but I believe they need some way to add new UI
to Firefox as well. That’s out of scope here.)

Chrome has the [Vimium] extension, which is similar to Vimperator and VimFx.
Vimium listens for keydown events in content scripts (there's nothing else
available). People keep requesting the same features from Vimium, but there's
nothing they can do, because the Chrome extension API does not allow them:

- Vimium can't focus or blur the location bar. Instead, they've built their own
  location bar. There are no APIs for dealing with the location bar. Even if
  they were, Vimium couldn't bind the Escape key to do the blurring when inside
  the location bar. You can be similarly "trapped" inside the dev tools, for
  instance.
- Vimium can't interact with the find bar. Instead, they've built their own.
- Vimium can't do anything on chrome:// tabs, new-tab-page tabs, or any tabs
  where Chrome decided not to allow extensions. This is especially bad when
  using the shortcut to focus the next tab. If you come across a disallowed tab,
  you get stuck there and can't move on (with Vimium shortcuts).


## API summary

- `browser.keyboard.onKey` is a lower-level version of
  [`browser.commands.onCommand`].
- `browser.keyboardShortcutActions` contains simple functions to trigger
  standard Firefox keyboard shortcuts programmatically.
- A way to “escape” from the location bar (and other Firefox UI elements that
  can receive keyboard input) and return to the “content area.”

The above three bullet points are discussed and documented in the next three
sections.


## `browser.keyboard`

Requires permission: Yes, since the add-on will be able to disabled all Firefox
shortcuts.

`browser.keyboard` only contains one property: `onKey`. These are its exposed
methods:

- `browser.keyboard.onKey.addListener(keySpec, listener, options = {})`
- `browser.keyboard.onKey.removeListener(keySpec, listener, options = {})`
- `browser.keyboard.onKey.hasListener(keySpec, listener, options = {})`

The above mirrors `browser.commands.onCommand` on purpose:

- `browser.commands.onCommand.addListener(listener)`
- `browser.commands.onCommand.removeListener(listener)`
- `browser.commands.onCommand.hasListener(listener)`

Differences to `browser.commands.onCommand`:

- Allows any key press as a keyboard shortcut, not just
  [“modifier+key”][shortcut-values] shortcuts (more or less).
- Are added programmatically, rather than through manifest.json.
- Can be removed programmatically.
- No restrictions on the number of shortcuts.

`browser.commands.onCommand` will still be the promoted API for add-ons that
only add a couple of keyboard shortcuts to some of its functionality.
`browser.keyboard.onKey` is for add-ons whose sole purpose is dealing with
keyboard shortcuts in a more advanced way.

Differences to adding a `'keydown'` event listener in a content script:

- That will only work when the content script has loaded.
- That will only work in tabs that have a content script. Not on `about:` pages,
  for example.
- Having the keyboard handling in the main process means that slow web pages
  can’t make the keyboard shortcuts slow.

(The above limitations is what Vimium has to live with, as mentioned earlier.)

### Details

When a `browser.keyboard.onKey` listener is invoked, the `'keydown'` event that
triggered it is suppressed, as well as the corresponding `'keypress'` and
`'keyup'` events:

- Firefox keyboard shortcuts (if any) are _not_ run.
- The web page never receives the `'keydown'`, `'keypress'` and `'keyup'` events
  (unless `options.defaultPreventable` is `true`; see below).

A `browser.keyboard.onKey` listener is _not_ run if a Firefox UI element that
can receive keyboard input, such as the location bar, is focused.

- This is because add-ons such as VimFx wants to add single-letter keyboard
  shortcuts. For example: `t` to open a new tab. If that listener were to be
  triggered in the location bar, the user wouldn’t be able to type URLs
  containing `t`s.
- This also provides security: An add-on cannot cripple Firefox into not being
  able to type anything in its UI.
- This is why a way to “escape” from the location bar (and other Firefox UI
  elements that can receive keyboard input) and return to the “content area” is
  so important (more on this later).

A `browser.keyboard.onKey` listener _is_ run if a web page element that can
receive keyboard input is focused, though. It is up to the add-on author to keep
track of the currently focused element in a content script and temporarily use
`browser.keyboard.onKey.removeListener` when needed.

- Add-ons such as VimFx needs to keep track of the currently focused element
  anyway, since its toolbar button (browser action) changes color based on it.
  This allows the user to see if the key presses will result in typed characters
  or triggered VimFx commands.
- This allows add-ons (such as VimFx) to provide keyboard shortcuts that work
  even in text inputs.

### Methods

#### addListener(keySpec, listener, options = {})

Adds a listener for a key press that matches `keySpec`.

#### removeListener(keySpec, listener, options = {})

Stop listening to key presses matching `keySpec`. The arguments must match the
listener to remove.

#### hasListener(keySpec, listener, options = {})

Check whether a listener is registered for the provided arguments. Returns true
if it is listening, false otherwise.

### Parameters

#### keySpec

`keySpec` is a plain object. When pressing a key, Firefox will construct a
[KeyboardEvent] and compare it to `keySpec`. If every property of `keySpec` is
present in the KeyboardEvent and has the same value as in `keySpec`, `listener`
will be run.

`keySpec` must specify at least the `key` or `code` property.

Regarding the KeyboardEvent:

- `event.type` is always `'keydown'`.
- Any property that isn’t a string, a number or a boolean are always treated as
  `undefined` when comparing with `keySpec`. Example properties: `event.view`,
  `event.currentTarget` and `event.target`.

Example `keySpec`s:

```js
{
  key: 'a'
}
```

```js
{
  code: 'Escape',
  ctrlKey: true,
}
```

### listener

A function that will be called as specified in the previous section about
`keySpec`. It does not receive any arguments.

### options

An optional object with options. The available properties are:

- `defaultPreventable`. Boolean. Defaults to `false`. If `true`, `listener`
  won’t be run if `event.preventDefault()` is run in a `'keydown'` event
  listener in the current web page.


## `browser.keyboardShortcutActions`

Requires permission: No.

This is an object, whose properties are simple functions that take no arguments.
Calling such a function is exactly the same as pressing the keys needed to
trigger a Firefox keyboard shortcut. For example:

```js
browser.keyboardShortcutActions.selectLocationBar()
```

The properties are named like the keyboard shortcuts are named here: https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly

Since all the functions take no arguments and only promise to do trigger a
keyboard shortcut action, they shouldn’t cause any maintenance or backwards
compatibility problems.


## “Escaping” from UI elements

The suggestion is to implement this as
`browser.keyboardShortcutActions.focusContent()`, even though there is no
Firefox keyboard shortcut to do this today (but the F6 shortcut comes close).
However, I think this is a good keyboard shortcut to add. This way, there’s no
need to add a new API just for this little feature.

## How VimFx intends to use these APIs

- Use `browser.keyboard.onKey.addListener()` and
  `browser.keyboard.onKey.removeListener()` based on:

  - User preferences.
  - The current “Vim” mode.
  - The previously pressed keys.

- Add a `browser.commands` command with the shortcut Ctrl+E that runs
  `browser.keyboardShortcutActions.focusContent()`. That will be the way to
  “exit” the location bar, for example.

- Use most of the functions in `browser.keyboardShortcutActions`.


[`browser.commands.onCommand`]: https://developer.mozilla.org/Add-ons/WebExtensions/API/commands/onCommand
[bug-1215061]: https://bugzilla.mozilla.org/show_bug.cgi?id=1215061
[Keybinder]: https://addons.mozilla.org/firefox/addon/keybinder/
[KeyboardEvent]: https://developer.mozilla.org/docs/Web/API/KeyboardEvent
[keyconfig]: http://forums.mozillazine.org/viewtopic.php?t=72994
[Menu Wizard]: https://addons.mozilla.org/firefox/addon/s3menu-wizard/
[Pentadactyl]: https://addons.mozilla.org/firefox/addon/pentadactyl/
[shortcut-values]: https://developer.mozilla.org/Add-ons/WebExtensions/manifest.json/commands#Shortcut_values
[VimFx]: https://addons.mozilla.org/firefox/addon/vimfx/
[Vimium]: https://github.com/philc/vimium/
[Vimperator]: https://addons.mozilla.org/firefox/addon/vimperator/
[WebExtension]: https://developer.mozilla.org/Add-ons/WebExtensions
