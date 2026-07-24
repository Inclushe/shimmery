# Shimmery


## Usage

```
npx local-web-server --https
```

## TODO

- [ ] Refactor shimmer code into library
  - [x] Separate into shimmery.js
  - [x] Make sure everything works first
    - [x] Recording
      - [x] Save
      - [x] Play
    - [x] Permission request
    - [x] Toggles
      - were not hooked up before, but worked because JS automatically pulls elements with IDs into variables
        - don't do that
  - [ ] Remove direct references to the shimmery object in index.html
    - [ ] Separate demo code/references to raw sensor data out from shimmery.js
    - [ ] Handle permission request in the library
  - [ ] Create barebones version of index.html
    - No toggles
  - [ ] Separate components from main
    - might be too tightly coupled
    - necessary? it's under 10kb minified/gzipped
    - [ ] debug
    - [ ] recording
    - [ ] testing
    - [ ] algorithms
  - Separate inputs/toggles from code
    - Should be sent to update function
  - Library should have debug toggle
    - Only send live preview of variables when enabled
  - Library should not handle demo mode
    - [x] Remove ternary debug variables
  - [x] Double check raw input is not smoothed
  - Algo specific variables are all combined together

- requestPermission
  - try catch?

- requestDevicePermissions(arg)
  - arg
    - empty
      - add click handler to window if auto permission request fails
      - log warning: missing element, defaulting to window
    - string
      - add click handler to querySelector(string) if auto permission request fails
      - if string is not a valid selector, log error: invalid selector
    - HTMLElement
      - add click handler to element if auto permission request fails
      - if element is not a valid HTMLElement, log error: invalid element
  - attempt auto permission request
    - if works, resolve instantly
    - if fails, wait for user to grant permission through arg
  - if user grants permission, resolve
  - else, throw error, send to catch
    - ideally, show prompt of steps on how to resolve
  - Window event listeners can be attached at any time, not after permission is granted
    - do not await

- init / new Shimmery()
  - permissionElement
  - options
    - permission
    - debug - boolean - default false
      - show console logs
      - visual - boolean
        - overlays ui
        - show logs as well?
    - mode
      - raw, velocity, spring, comoving
    - limiters
      - linear accel, absJerk default true
    - useOutsideEventListeners - boolean - default false
      - very rarely needed
      - if true, do not set up event listeners from shimmery
        - main sets up event listeners, pass them to shimmery
          - onOrientation(e)
          - onMotion(e)
- getOptions() - object
- setOptions() - object
  - pass current _private variables
  - current keys not in object stay, only update ones included in arg object
- getOrientation()
  - returns same as DeviceOrientationEvent (alpha, beta, gamma)
- onOrientation(e)
- onMotion(e)

- demo.html
- main
  - minimal
  - complex
- debug
  - separate from ui
- recording
  - option in API to use recording
  - need to expose variables from API
- testing
  - separate from ui
- permission
  - separate from main?
- playground
  - add option to set code