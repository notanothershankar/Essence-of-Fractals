# Fractal Explorer

GPU-rendered Mandelbrot/Julia set viewer for the Fractal card.
Built with WebGL 2 — uses double-single float emulation in the shader so you can zoom past where regular floats break down.

## try it
Open `index.html`.
scroll to zoom, drag to pan, J for julia mode, shift+hover to pick the julia constant from the mandelbrot view

## stuff i'd add with more time
- mobile / touch pinch controls
- perturbation theory for REALLY deep zoom (card mentioned 10^14x)
- distance estimation boundary glow
