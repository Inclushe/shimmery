# Shimmery


## Usage

```
npx local-web-server --https
```

## TODO

- [ ] Refactor shimmer code into library
  - Separate inputs/toggles from code
    - Should be sent to update function
  - Library should have debug toggle
    - Only send live preview of variables when enabled
  - Library should not handle demo mode
    - [x] Remove ternary debug variables
  - [x] Double check raw input is not smoothed
  - Algo specific variables are all combined together

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