# Shimmery Research

## Sanity Check

API test: https://resplendent-griffin-95a5e6.netlify.app/

- DeviceOrientation API is cross-browser and widely supported
  - Supported in everything
    - Safari requires user permission
  - Smoothed + minimal delay
- WebXR inline
  - Only supported in Chrome
  - Smoothed + minimal delay like DeviceOrientation
  - Pretty much identical to DeviceOrientation
- Accelerometer API
  - Only supported in Chrome
  - Unsmoothed, no delay
  - Jittery, especially with hard shakes/knocks
    - Could use limiter like with Shimmery
      - However, limiter defaults to DeviceOrientation value
  - Not much different than DeviceOrientation with large motions
- Frequency limited for security reasons
  - Chromium reason, not sure about Safari
  - https://www.w3.org/TR/generic-sensor/#limit-max-frequency
- Most likely "smoothed" for a good reason
  - The raw sensor data when grabbed from the Accelerometer API is jittery