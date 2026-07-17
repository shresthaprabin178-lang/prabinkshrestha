// ==========================================================================
// STEEL SECTION CALCULATOR MODULE
// ==========================================================================
const SHAPE_CONFIG = {
  ibeam: {
    inputs: [
      { id: 'ibH', label: 'Height (H)', value: 200, unit: 'mm', min: 10 },
      { id: 'ibB', label: 'Flange Width (B)', value: 100, unit: 'mm', min: 10 },
      { id: 'ibTw', label: 'Web Thickness (tw)', value: 5.7, unit: 'mm', min: 1 },
      { id: 'ibTf', label: 'Flange Thickness (tf)', value: 8.5, unit: 'mm', min: 1 }
    ]
  },
  channel: {
    inputs: [
      { id: 'chH', label: 'Height (H)', value: 200, unit: 'mm', min: 10 },
      { id: 'chB', label: 'Flange Width (B)', value: 75, unit: 'mm', min: 10 },
      { id: 'chTw', label: 'Web Thickness (tw)', value: 6.0, unit: 'mm', min: 1 },
      { id: 'chTf', label: 'Flange Thickness (tf)', value: 11.4, unit: 'mm', min: 1 }
    ]
  },
  angle: {
    inputs: [
      { id: 'angH', label: 'Leg Height (H)', value: 100, unit: 'mm', min: 5 },
      { id: 'angB', label: 'Leg Width (B)', value: 100, unit: 'mm', min: 5 },
      { id: 'angT', label: 'Thickness (t)', value: 10, unit: 'mm', min: 1 }
    ]
  },
  box: {
    inputs: [
      { id: 'boxH', label: 'Height (H)', value: 100, unit: 'mm', min: 5 },
      { id: 'boxB', label: 'Width (B)', value: 100, unit: 'mm', min: 5 },
      { id: 'boxT', label: 'Wall Thickness (t)', value: 5, unit: 'mm', min: 0.5 }
    ]
  },
  pipe: {
    inputs: [
      { id: 'pipeD', label: 'Outer Diameter (D)', value: 114.3, unit: 'mm', min: 5 },
      { id: 'pipeT', label: 'Wall Thickness (t)', value: 4.5, unit: 'mm', min: 0.5 }
    ]
  }
};

function changeShape() {
  const shape = document.getElementById('steelShape').value;
  const container = document.getElementById('dynamicInputs');
  if (!container) return;
  container.innerHTML = '';
  
  const config = SHAPE_CONFIG[shape];
  config.inputs.forEach(input => {
    const group = document.createElement('div');
    group.className = 'input-group';
    group.innerHTML = `
      <label class="input-label" for="${input.id}">${input.label} <span>(${input.unit})</span></label>
      <input type="number" id="${input.id}" class="input-field" value="${input.value}" min="${input.min}" step="any" oninput="calculateProperties()">
    `;
    container.appendChild(group);
  });
  
  calculateProperties();
}

function calculateProperties() {
  const shape = document.getElementById('steelShape').value;
  const densityInput = document.getElementById('steelDensity');
  const density = densityInput ? (parseFloat(densityInput.value) || 7850) : 7850;
  
  let area = 0; // mm2
  let ix = 0;   // mm4
  let iy = 0;   // mm4
  let zx = 0;   // mm3
  let zy = 0;   // mm3
  
  let svgMarkup = '';

  if (shape === 'ibeam') {
    const H = parseFloat(document.getElementById('ibH').value) || 1;
    const B = parseFloat(document.getElementById('ibB').value) || 1;
    const tw = parseFloat(document.getElementById('ibTw').value) || 1;
    const tf = parseFloat(document.getElementById('ibTf').value) || 1;
    
    const actualTw = Math.min(tw, B - 1);
    const actualTf = Math.min(tf, H / 2 - 0.5);

    area = 2 * B * actualTf + (H - 2 * actualTf) * actualTw;
    ix = (B * Math.pow(H, 3) - (B - actualTw) * Math.pow(H - 2 * actualTf, 3)) / 12;
    iy = (2 * actualTf * Math.pow(B, 3) + (H - 2 * actualTf) * Math.pow(actualTw, 3)) / 12;
    
    zx = ix / (H / 2);
    zy = iy / (B / 2);

    const scale = 200 / Math.max(H, B);
    const sh = H * scale;
    const sb = B * scale;
    const stw = actualTw * scale;
    const stf = actualTf * scale;
    const x0 = (240 - sb) / 2;
    const y0 = (240 - sh) / 2;

    svgMarkup = `
      <svg width="240" height="240" viewBox="0 0 240 240">
        <path d="M ${x0} ${y0} 
                 h ${sb} 
                 v ${stf} 
                 h ${-(sb - stw)/2} 
                 v ${sh - 2 * stf} 
                 h ${(sb - stw)/2} 
                 v ${stf} 
                 h ${-sb} 
                 v ${-stf} 
                 h ${(sb - stw)/2} 
                 v ${-(sh - 2 * stf)} 
                 h ${-(sb - stw)/2} 
                 z" 
              fill="none" stroke="var(--primary)" stroke-width="2.5" fill-opacity="0.1"/>
        <circle cx="120" cy="120" r="4" fill="var(--secondary)"/>
        <line x1="120" y1="20" x2="120" y2="220" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
        <line x1="20" y1="120" x2="220" y2="120" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
      </svg>
    `;
    
  } else if (shape === 'channel') {
    const H = parseFloat(document.getElementById('chH').value) || 1;
    const B = parseFloat(document.getElementById('chB').value) || 1;
    const tw = parseFloat(document.getElementById('chTw').value) || 1;
    const tf = parseFloat(document.getElementById('chTf').value) || 1;
    
    const actualTw = Math.min(tw, B - 1);
    const actualTf = Math.min(tf, H / 2 - 0.5);

    area = 2 * B * actualTf + (H - 2 * actualTf) * actualTw;
    const xc = (2 * (B * actualTf) * (B / 2) + (H - 2 * actualTf) * actualTw * (actualTw / 2)) / area;
    
    ix = (B * Math.pow(H, 3) - (B - actualTw) * Math.pow(H - 2 * actualTf, 3)) / 12;
    iy = 2 * ((actualTf * Math.pow(B, 3)) / 12 + B * actualTf * Math.pow(B / 2 - xc, 2)) +
         ((H - 2 * actualTf) * Math.pow(actualTw, 3)) / 12 + (H - 2 * actualTf) * actualTw * Math.pow(xc - actualTw / 2, 2);
         
    zx = ix / (H / 2);
    zy = iy / Math.max(xc, B - xc);

    const scale = 200 / Math.max(H, B);
    const sh = H * scale;
    const sb = B * scale;
    const stw = actualTw * scale;
    const stf = actualTf * scale;
    const sxc = xc * scale;
    const x0 = (240 - sb) / 2;
    const y0 = (240 - sh) / 2;

    svgMarkup = `
      <svg width="240" height="240" viewBox="0 0 240 240">
        <path d="M ${x0} ${y0} 
                 h ${sb} 
                 v ${stf} 
                 h ${-(sb - stw)} 
                 v ${sh - 2 * stf} 
                 h ${sb - stw} 
                 v ${stf} 
                 h ${-sb} 
                 z" 
              fill="none" stroke="var(--primary)" stroke-width="2.5" fill-opacity="0.1"/>
        <circle cx="${x0 + sxc}" cy="120" r="4" fill="var(--secondary)"/>
        <line x1="${x0 + sxc}" y1="20" x2="${x0 + sxc}" y2="220" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
        <line x1="20" y1="120" x2="220" y2="120" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
      </svg>
    `;

  } else if (shape === 'angle') {
    const H = parseFloat(document.getElementById('angH').value) || 1;
    const B = parseFloat(document.getElementById('angB').value) || 1;
    const t = parseFloat(document.getElementById('angT').value) || 1;
    
    const actualT = Math.min(t, Math.min(H, B) - 0.5);

    const a1 = (H - actualT) * actualT;
    const x1 = actualT / 2;
    const y1 = actualT + (H - actualT) / 2;

    const a2 = B * actualT;
    const x2 = B / 2;
    const y2 = actualT / 2;

    area = a1 + a2;
    const xc = (a1 * x1 + a2 * x2) / area;
    const yc = (a1 * y1 + a2 * y2) / area;

    ix = ((actualT * Math.pow(H - actualT, 3)) / 12 + a1 * Math.pow(y1 - yc, 2)) +
         ((B * Math.pow(actualT, 3)) / 12 + a2 * Math.pow(y2 - yc, 2));

    iy = (((H - actualT) * Math.pow(actualT, 3)) / 12 + a1 * Math.pow(x1 - xc, 2)) +
         ((actualT * Math.pow(B, 3)) / 12 + a2 * Math.pow(x2 - xc, 2));

    zx = ix / Math.max(yc, H - yc);
    zy = iy / Math.max(xc, B - xc);

    const scale = 200 / Math.max(H, B);
    const sh = H * scale;
    const sb = B * scale;
    const st = actualT * scale;
    const sxc = xc * scale;
    const syc = yc * scale;
    const x0 = (240 - sb) / 2;
    const y0 = (240 - sh) / 2;

    svgMarkup = `
      <svg width="240" height="240" viewBox="0 0 240 240">
        <path d="M ${x0} ${y0} 
                 h ${st} 
                 v ${sh - st} 
                 h ${sb - st} 
                 v ${st} 
                 h ${-sb} 
                 z" 
              fill="none" stroke="var(--primary)" stroke-width="2.5" fill-opacity="0.1"/>
        <circle cx="${x0 + sxc}" cy="${y0 + sh - syc}" r="4" fill="var(--secondary)"/>
        <line x1="${x0 + sxc}" y1="20" x2="${x0 + sxc}" y2="220" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
        <line x1="20" y1="${y0 + sh - syc}" x2="220" y2="${y0 + sh - syc}" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
      </svg>
    `;

  } else if (shape === 'box') {
    const H = parseFloat(document.getElementById('boxH').value) || 1;
    const B = parseFloat(document.getElementById('boxB').value) || 1;
    const t = parseFloat(document.getElementById('boxT').value) || 1;
    
    const actualT = Math.min(t, Math.min(H, B)/2 - 0.5);

    area = (B * H) - (B - 2 * actualT) * (H - 2 * actualT);
    ix = (B * Math.pow(H, 3) - (B - 2 * actualT) * Math.pow(H - 2 * actualT, 3)) / 12;
    iy = (H * Math.pow(B, 3) - (H - 2 * actualT) * Math.pow(B - 2 * actualT, 3)) / 12;
    
    zx = ix / (H / 2);
    zy = iy / (B / 2);

    const scale = 200 / Math.max(H, B);
    const sh = H * scale;
    const sb = B * scale;
    const st = actualT * scale;
    const x0 = (240 - sb) / 2;
    const y0 = (240 - sh) / 2;

    svgMarkup = `
      <svg width="240" height="240" viewBox="0 0 240 240">
        <rect x="${x0}" y="${y0}" width="${sb}" height="${sh}" fill="none" stroke="var(--primary)" stroke-width="2.5" fill-opacity="0.1"/>
        <rect x="${x0 + st}" y="${y0 + st}" width="${sb - 2*st}" height="${sh - 2*st}" fill="var(--bg-color)" stroke="var(--primary)" stroke-width="1.5"/>
        <circle cx="120" cy="120" r="4" fill="var(--secondary)"/>
        <line x1="120" y1="20" x2="120" y2="220" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
        <line x1="20" y1="120" x2="220" y2="120" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
      </svg>
    `;

  } else if (shape === 'pipe') {
    const D = parseFloat(document.getElementById('pipeD').value) || 1;
    const t = parseFloat(document.getElementById('pipeT').value) || 1;
    
    const actualT = Math.min(t, D / 2 - 0.5);
    const d = D - 2 * actualT;

    area = Math.PI * (Math.pow(D, 2) - Math.pow(d, 2)) / 4;
    ix = Math.PI * (Math.pow(D, 4) - Math.pow(d, 4)) / 64;
    iy = ix;
    
    zx = ix / (D / 2);
    zy = zx;

    const scale = 200 / D;
    const sD = D * scale;
    const sd = d * scale;

    svgMarkup = `
      <svg width="240" height="240" viewBox="0 0 240 240">
        <circle cx="120" cy="120" r="${sD/2}" fill="none" stroke="var(--primary)" stroke-width="2.5" fill-opacity="0.1"/>
        <circle cx="120" cy="120" r="${sd/2}" fill="var(--bg-color)" stroke="var(--primary)" stroke-width="1.5"/>
        <circle cx="120" cy="120" r="4" fill="var(--secondary)"/>
        <line x1="120" y1="20" x2="120" y2="220" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
        <line x1="20" y1="120" x2="220" y2="120" stroke="var(--secondary)" stroke-dasharray="3 3" stroke-width="1"/>
      </svg>
    `;
  }

  const weight = (area * 1e-6) * density; // kg/m

  document.getElementById('resArea').textContent = `${(area / 100).toFixed(2)} cm²`;
  document.getElementById('resWeight').textContent = `${weight.toFixed(2)} kg/m`;
  document.getElementById('resIx').textContent = `${(ix / 10000).toFixed(2)} cm⁴`;
  document.getElementById('resIy').textContent = `${(iy / 10000).toFixed(2)} cm⁴`;
  document.getElementById('resZx').textContent = `${(zx / 1000).toFixed(2)} cm³`;
  document.getElementById('resZy').textContent = `${(zy / 1000).toFixed(2)} cm³`;
  
  const svgContainer = document.getElementById('svgContainer');
  if (svgContainer) svgContainer.innerHTML = svgMarkup;
}

// Initialize calculator
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('steelShape')) {
    changeShape();
  }
});
