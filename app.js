// Mandelbrot & Julia Explorer with WebGL 2.0
// Uses emulated double precision in the fragment shader for zooming.

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });

if (!gl) {
    alert('WebGL 2.0 is not supported in your browser.');
    throw new Error('WebGL 2.0 not supported');
}

// Vertex shader: full-screen triangle
const vsSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Fragment shader
const fsSource = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_center_hi;
uniform vec2 u_center_lo;
uniform float u_zoom;
uniform int u_max_iter;
uniform int u_palette;
uniform float u_time;
uniform bool u_is_julia;
uniform vec2 u_julia_c;
uniform bool u_deep_precision;

const float TAU = 6.2831853;

// double-single float routines for deep zoom
vec2 ds_set(float a) {
    return vec2(a, 0.0);
}

vec2 ds_add(vec2 a, vec2 b) {
    float t1 = a.x + b.x;
    float e = t1 - a.x;
    float t2 = ((b.x - e) + (a.x - (t1 - e))) + a.y + b.y;
    return vec2(t1 + t2, t2 - ((t1 + t2) - t1));
}

vec2 ds_sub(vec2 a, vec2 b) {
    return ds_add(a, vec2(-b.x, -b.y));
}

vec2 ds_mul(vec2 a, vec2 b) {
    float c11 = a.x * b.x;
    float c21 = a.x * b.y + a.y * b.x;
    const float split = 4097.0;
    float cona = a.x * split;
    float a1 = cona - (cona - a.x);
    float a2 = a.x - a1;
    float conb = b.x * split;
    float b1 = conb - (conb - b.x);
    float b2 = b.x - b1;
    float c12 = c11 - a1 * b1 - a2 * b1 - a1 * b2 - a2 * b2;
    float t1 = c11 + c21;
    float e = t1 - c11;
    float t2 = ((c21 - e) + (c11 - (t1 - e))) + c12;
    return vec2(t1 + t2, t2 - ((t1 + t2) - t1));
}

vec3 getPalette(float t, int pal) {
    vec3 a, b, c, d;
    if (pal == 0) {
        // Electric Blue / Cyan
        a = vec3(0.5, 0.5, 0.5); b = vec3(0.5, 0.5, 0.5);
        c = vec3(1.0, 1.0, 1.0); d = vec3(0.00, 0.33, 0.67);
    } else if (pal == 1) {
        // Fire / Magma
        a = vec3(0.5, 0.5, 0.5); b = vec3(0.5, 0.5, 0.5);
        c = vec3(2.0, 1.0, 0.0); d = vec3(0.50, 0.20, 0.25);
    } else if (pal == 2) {
        // Acid Green
        a = vec3(0.2, 0.5, 0.2); b = vec3(0.2, 0.5, 0.2);
        c = vec3(1.0, 1.0, 1.0); d = vec3(0.00, 0.33, 0.20);
    } else if (pal == 3) {
        // Rainbow
        a = vec3(0.5, 0.5, 0.5); b = vec3(0.5, 0.5, 0.5);
        c = vec3(1.0, 1.0, 1.0); d = vec3(0.00, 0.10, 0.20);
    } else if (pal == 4) {
        // Purple / Violet
        a = vec3(0.8, 0.5, 0.4); b = vec3(0.2, 0.4, 0.2);
        c = vec3(2.0, 1.0, 1.0); d = vec3(0.00, 0.25, 0.25);
    } else {
        // Monochrome
        float g = 0.5 + 0.5 * cos(TAU * t);
        return vec3(g);
    }
    return a + b * cos(TAU * (c * t + d));
}

void main() {
    // using v_uv from vertex shader instead of gl_FragCoord
    vec2 screenOffset = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

    float iter = 0.0;
    bool escaped = false;
    vec2 finalZ = vec2(0.0);
    float trap = 1e5;

    if (u_deep_precision) {
        vec2 c_x, c_y, z_x, z_y;

        vec2 off_x = ds_add(vec2(u_center_hi.x, u_center_lo.x), ds_set(screenOffset.x * u_zoom));
        vec2 off_y = ds_add(vec2(u_center_hi.y, u_center_lo.y), ds_set(screenOffset.y * u_zoom));

        if (u_is_julia) {
            z_x = off_x;
            z_y = off_y;
            c_x = ds_set(u_julia_c.x);
            c_y = ds_set(u_julia_c.y);
        } else {
            z_x = ds_set(0.0);
            z_y = ds_set(0.0);
            c_x = off_x;
            c_y = off_y;
        }

        for (int i = 0; i < 2500; i++) {
            if (i >= u_max_iter) break;

            vec2 zx2 = ds_mul(z_x, z_x);
            vec2 zy2 = ds_mul(z_y, z_y);

            // cross orbit trap (distance to axes)
            trap = min(trap, min(abs(z_x.x), abs(z_y.x)));

            if (zx2.x + zy2.x > 4.0) {
                iter = float(i);
                escaped = true;
                finalZ = vec2(z_x.x, z_y.x);
                break;
            }

            vec2 zxy = ds_mul(z_x, z_y);
            z_x = ds_add(ds_sub(zx2, zy2), c_x);
            z_y = ds_add(ds_add(zxy, zxy), c_y);
        }
    } else {
        vec2 c, z;
        vec2 uvCoord = u_center_hi + screenOffset * u_zoom;

        if (u_is_julia) {
            z = uvCoord;
            c = u_julia_c;
        } else {
            z = vec2(0.0);
            c = uvCoord;
        }

        for (int i = 0; i < 2500; i++) {
            if (i >= u_max_iter) break;

            float zx2 = z.x * z.x;
            float zy2 = z.y * z.y;

            trap = min(trap, min(abs(z.x), abs(z.y)));

            if (zx2 + zy2 > 4.0) {
                iter = float(i);
                escaped = true;
                finalZ = z;
                break;
            }

            z = vec2(zx2 - zy2, 2.0 * z.x * z.y) + c;
        }
    }

    if (u_palette == 6) {
        // orbit trap coloring (tracks closest approach to coordinate axes)
        float d = clamp(sqrt(trap) * 2.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.08, 0.05, 0.2), vec3(0.9, 0.6, 0.2), pow(d, 0.5));
        fragColor = vec4(col, 1.0);
        return;
    }

    if (!escaped) {
        fragColor = vec4(0.03, 0.03, 0.05, 1.0);
    } else {
        // using the smooth iteration trick from the hackathon card
        // formula: n + 1 - log(log(|z|)) / log(2)
        float nu = iter + 1.0 - log(log(dot(finalZ, finalZ)) * 0.5) / log(2.0);
        // 45 looked best after trying a few divisors
        float t = (nu / 45.0) + u_time * 0.15;
        fragColor = vec4(getPalette(t, u_palette), 1.0);
    }
}
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
const program = gl.createProgram();
gl.attachShader(program, vs);
gl.attachShader(program, fs);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
}

// big triangle that covers the screen
const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1.0, -1.0,
     3.0, -1.0,
    -1.0,  3.0
]), gl.STATIC_DRAW);

const posAttrib = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(posAttrib);
gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);

// uniforms
const uniforms = {
    u_resolution: gl.getUniformLocation(program, 'u_resolution'),
    u_center_hi: gl.getUniformLocation(program, 'u_center_hi'),
    u_center_lo: gl.getUniformLocation(program, 'u_center_lo'),
    u_zoom: gl.getUniformLocation(program, 'u_zoom'),
    u_max_iter: gl.getUniformLocation(program, 'u_max_iter'),
    u_palette: gl.getUniformLocation(program, 'u_palette'),
    u_time: gl.getUniformLocation(program, 'u_time'),
    u_is_julia: gl.getUniformLocation(program, 'u_is_julia'),
    u_julia_c: gl.getUniformLocation(program, 'u_julia_c'),
    u_deep_precision: gl.getUniformLocation(program, 'u_deep_precision')
};

// State management
const state = {
    centerX: -0.7,
    centerY: 0.0,
    zoom: 3.0,
    maxIter: 350,
    palette: 0,
    isJulia: false,
    juliaC: { x: -0.7, y: 0.27015 },
    animate: true,
    time: 0.0
};

// split into hi/lo for the shader
function splitFloat(n) {
    const hi = Math.fround(n);
    return [hi, n - hi];
}

// Resize canvas to full window
function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
    }
}
window.addEventListener('resize', resize);
resize();

// UI Elements
const sliderIter = document.getElementById('slider-iter');
const labelIter = document.getElementById('label-iter');
const selectPalette = document.getElementById('select-palette');
const selectPreset = document.getElementById('select-preset');
const chkJulia = document.getElementById('chk-julia');
const chkAnimate = document.getElementById('chk-animate');
const btnReset = document.getElementById('btn-reset');

const statZoom = document.getElementById('stat-zoom');
const statX = document.getElementById('stat-x');
const statY = document.getElementById('stat-y');
const statFps = document.getElementById('stat-fps');

// spots found while exploring
const presets = {
    default: { x: -0.7, y: 0.0, zoom: 3.0, iter: 350, julia: false },
    seahorse: { x: -0.7436438870371, y: 0.1318259042053, zoom: 0.00012, iter: 450, julia: false },
    spiral: { x: -0.74364313521, y: 0.13182596304, zoom: 0.00000042, iter: 650, julia: false },
    minibrot: { x: -1.7687788332, y: -0.0017389945, zoom: 0.0000000015, iter: 900, julia: false },
    elephant: { x: 0.27512, y: 0.00734, zoom: 0.025, iter: 350, julia: false },
    rabbit: { x: 0.0, y: 0.0, zoom: 2.5, iter: 300, julia: true, jx: -0.123, jy: 0.745 }
};

selectPreset.addEventListener('change', () => {
    const p = presets[selectPreset.value];
    if (!p) return;
    state.centerX = p.x;
    state.centerY = p.y;
    state.zoom = p.zoom;
    state.maxIter = p.iter;
    state.isJulia = p.julia;
    if (p.jx !== undefined) state.juliaC = { x: p.jx, y: p.jy };

    sliderIter.value = p.iter;
    labelIter.textContent = p.iter;
    chkJulia.checked = p.julia;
});

sliderIter.addEventListener('input', () => {
    state.maxIter = parseInt(sliderIter.value);
    labelIter.textContent = state.maxIter;
});

selectPalette.addEventListener('change', () => {
    state.palette = parseInt(selectPalette.value);
});

chkJulia.addEventListener('change', () => {
    state.isJulia = chkJulia.checked;
});

chkAnimate.addEventListener('change', () => {
    state.animate = chkAnimate.checked;
});

btnReset.addEventListener('click', () => {
    selectPreset.value = 'default';
    selectPreset.dispatchEvent(new Event('change'));
});

// TODO: pinch to zoom on mobile (mouse wheel works for now)
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const zoomFactor = e.deltaY > 0 ? 1.15 : (1.0 / 1.15);
    const newZoom = state.zoom * zoomFactor;

    var aspect = canvas.width / canvas.height;
    const nx = ((e.clientX / window.innerWidth) - 0.5) * aspect;
    const ny = (0.5 - (e.clientY / window.innerHeight));

    const zoomDiff = state.zoom - newZoom;
    state.centerX += zoomDiff * nx;
    state.centerY += zoomDiff * ny;
    state.zoom = newZoom;
    // console.log('zoom:', state.zoom);

    // auto-iter scale sometimes overshoots if you zoom in too fast
    const depth = Math.max(0, -Math.log10(state.zoom));
    state.maxIter = Math.min(2500, Math.floor(250 + depth * 70));
    sliderIter.value = state.maxIter;
    labelIter.textContent = state.maxIter;
}, { passive: false });

// Click and drag to pan
let isDragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
});
window.addEventListener('mouseup', () => {
    isDragging = false;
});
window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const dx = (e.clientX - lastX) / window.innerHeight;
        const dy = (lastY - e.clientY) / window.innerHeight;
        lastX = e.clientX;
        lastY = e.clientY;

        state.centerX -= state.zoom * dx;
        state.centerY -= state.zoom * dy;
    } else if (!state.isJulia && e.shiftKey) {
        // shift+hover = pick julia c
        var aspect = canvas.width / canvas.height;
        const nx = ((e.clientX / window.innerWidth) - 0.5) * aspect;
        const ny = (0.5 - (e.clientY / window.innerHeight));
        state.juliaC = {
            x: state.centerX + state.zoom * nx,
            y: state.centerY + state.zoom * ny
        };
    }
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.code === 'Space') {
        chkAnimate.checked = !chkAnimate.checked;
        state.animate = chkAnimate.checked;
    } else if (e.key === 'j' || e.key === 'J') {
        chkJulia.checked = !chkJulia.checked;
        state.isJulia = chkJulia.checked;
    } else if (e.key === 'r' || e.key === 'R') {
        btnReset.click();
    }
});


// Render loop & FPS counter
let lastFrameTime = performance.now();
let frameCount = 0;
let fpsTimer = 0;

function render(now) {
    const dt = (now - lastFrameTime) * 0.001;
    lastFrameTime = now;

    frameCount++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
        statFps.textContent = Math.round(frameCount / fpsTimer);
        // console.log('fps:', Math.round(frameCount / fpsTimer));
        frameCount = 0;
        fpsTimer = 0;
    }

    if (state.animate) {
        state.time += dt;
    }

    gl.useProgram(program);

    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);

    const [cxHi, cxLo] = splitFloat(state.centerX);
    const [cyHi, cyLo] = splitFloat(state.centerY);
    gl.uniform2f(uniforms.u_center_hi, cxHi, cyHi);
    gl.uniform2f(uniforms.u_center_lo, cxLo, cyLo);

    gl.uniform1f(uniforms.u_zoom, state.zoom);
    gl.uniform1i(uniforms.u_max_iter, state.maxIter);
    gl.uniform1i(uniforms.u_palette, state.palette);
    gl.uniform1f(uniforms.u_time, state.time);
    gl.uniform1i(uniforms.u_is_julia, state.isJulia ? 1 : 0);
    gl.uniform2f(uniforms.u_julia_c, state.juliaC.x, state.juliaC.y);

    // is 0.0005 the right cutoff? seems to work
    const useDeep = state.zoom <= 0.0005;
    gl.uniform1i(uniforms.u_deep_precision, useDeep ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    statZoom.textContent = (3.0 / state.zoom).toExponential(2) + 'x';
    statX.textContent = state.centerX.toFixed(8);
    statY.textContent = state.centerY.toFixed(8);

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
