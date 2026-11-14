# MRIjs: Interactive Bloch Simulator & Learning Notebooks

**MRIjs** is a client-side JavaScript engine and visual simulation environment for nuclear magnetic resonance (NMR) and magnetic resonance imaging (MRI) physics. It provides numerical solutions to the Bloch equations across arbitrary spin isochromats with real-time 3D vector graphics, interactive sequence manipulation, and dedicated interactive educational notebooks.

---

## 🌟 Interactive Learning Notebooks: Live Paper & Reveal.js Slides

The learning suite follows the **Live Science Document / Live Paper paradigm** (combining reactive text, executable models, mathematical formalism, and interactive visualizations) and supports **two complete interactive modalities**:

1. **📄 Live Paper (Full Notebook)**: An in-depth, Distill-style computational research paper. Equations update reactively as you manipulate parameters, with live 2D/3D visualizers, live reactive text variables, and in-browser execution with MRIjs.
2. **📽️ Interactive Slides (Reveal.js)**: A presentation deck powered by **Reveal.js** where *every slide is fully interactive*. Sliders, vector canvases, 2D k-space studios, and "Run with MRIjs" simulations work live during presentations.

You can switch between modalities with one click using the top toggle bar in [`notebooks/index.html`](notebooks/index.html), or open the dedicated presentation deck at [`notebooks/slides.html`](notebooks/slides.html).

### 1. How does $B_0$ influence the precession frequency?
- **Theory**: Nuclear spin magnetic dipole moment $\vec{\mu} = \gamma \vec{I}$, torque $\vec{\tau} = \vec{\mu} \times \vec{B}_0$, and the Larmor relationship $\omega_0 = \gamma B_0$ ($f_0 = \frac{\gamma}{2\pi} B_0$).
- **Features**:
  - Interactive Larmor calculator across field strengths (0.05 T to 11.7 T) and isotopes ($^1\text{H}, ^{19}\text{F}, ^{31}\text{P}, ^{23}\text{Na}, ^{13}\text{C}$).
  - Water-fat chemical shift split ($\Delta f = 3.5\text{ ppm} \times f_0$) and thermal spin excess polarization.
  - Dual-Frame Interactive Canvas: Side-by-side comparison of Laboratory Frame (fast MHz rotation) vs. Rotating Frame (stationary on-resonance, slow phase drift for off-resonance $\Delta \omega$).
  - **MRIjs Code Example**: Simulating chemical shift destructive and constructive interference beat patterns with `BlochSimulator`.

### 2. How gradients produce the required magnetic fields to encode position?
- **Theory**: Spatially varying magnetic fields $\vec{B}(\vec{r}) = (B_0 + \vec{G} \cdot \vec{r})\hat{z}$ and the spatial Larmor mapping $\omega(x) = \omega_0 + \gamma G_x x$.
- **Features**:
  - The three encoding axes: Slice Selection ($G_z$), Frequency Encoding ($G_x$), and Phase Encoding ($G_y$).
  - Interactive Spatial Isochromat Array: Visualizes the linear field profile $B_z(x)$ and vector phase fan-out across 11 spatial isochromats, showing how gradient dephasing drops net transverse signal $\sum \vec{M}_{xy} \to 0$.
  - **MRIjs Code Example**: Simulating a Gradient Echo (GRE) sequence with dephasing and rephasing lobes, forming an echo peak at $t = TE$.

### 3. How RF pulses produce the $B_1$ magnetic field?
- **Theory**: Oscillating transverse fields $\vec{B}_1(t) = 2 B_1^e(t) \cos(\omega_{rf} t)\hat{x}$ and the effective rotating frame field $\vec{B}_{eff} = (B_0 - \omega_{rf}/\gamma)\hat{z}' + B_1\hat{x}'$.
- **Features**:
  - Resonant nutation and flip angle integral $\alpha = \gamma \int B_1(t) dt$.
  - Interactive 3D Bloch sphere vector nutation animation and flip angle explorer ($0^\circ$ to $180^\circ$).
  - RF pulse envelope shapes (Rectangular hard pulse vs. Sinc selective pulse vs. Gaussian) and slice thickness relation $\Delta z = \Delta f / (\gamma G_z)$.
  - **MRIjs Code Example**: Simulating arbitrary flip angles and relaxation trajectories ($M_z(t)$ and $M_{xy}(t)$).

### 4. How is the image formed? (k-Space & 2D Reconstruction)
- **Theory**: The fundamental continuous MRI signal equation $S(t) = \iint \rho(x,y) e^{-i 2\pi [k_x(t) x + k_y(t) y]} dx dy$ as the continuous 2D Fourier Transform of the object spin density.
- **Features**:
  - Definition of k-space coordinates $\vec{k}(t) = \frac{\gamma}{2\pi} \int \vec{G}(\tau) d\tau$.
  - 2D Inverse Discrete Fourier Transform (2D IDFT / FFT) image reconstruction.
  - Interactive 2D k-Space Studio: Real-time 2D DFT and reconstruction of digital phantoms (Shepp-Logan brain, geometric shapes, MRIjs logo).
  - Live interactive k-space filtering: low-pass (contrast preservation, edge blur), high-pass (edge detection, zero contrast), and phase-encode undersampling (aliasing / foldover ghosts).
  - Animated Cartesian line-by-line rastering trajectory.
  - **MRIjs Code Example**: Simulating a 1D spatial phantom under a readout gradient and reconstructing the 1D spatial profile via FFT.

---

## 🚀 Getting Started

No build step or Node compilation required. MRIjs runs directly in any modern web browser:

1. Open `index.html` in your browser for the full 3D Isochromat Simulation Lab.
2. Click **"Learning Notebooks"** in the top navigation bar (or open `notebooks/index.html`) to launch the interactive learning notebooks.

### Running Automated Physics & Translation Tests

Run the standalone numerical physics and translation test suites using Node.js:

```bash
# Run core Bloch equation solver tests (FID, GRE, SE)
node test.js

# Run Interactive Notebooks physics validation suite
node test_notebooks.js

# Run Bilingual Translation Engine validation suite
node test_translations.js
```

### 🌐 Bilingual Support (English & Spanish)

The entire interactive notebooks suite features seamless bilingual support (**English `en` and Spanish `es`**):
- **JSON Translation Dictionary**: All user interface text, pedagogical narratives, figure explanations, mathematical captions, and active learning checkpoints are maintained in [`notebooks/translations.json`](notebooks/translations.json).
- **Dual Runtime Loader**: Accompanied by [`notebooks/translations.js`](notebooks/translations.js) to guarantee 100% offline portability and compatibility with direct `file:///` local browser execution without CORS restrictions.
- **Instant Reactive Switching**: Click the `EN | ES` pill in the header of the Live Paper or the floating toolbar in Reveal.js Slides to toggle language instantly without reloading. All reactive formulas, KaTeX math blocks, and Chart.js datasets immediately update in the chosen language. Preference is persisted in `localStorage`.

### Offline & Air-Gapped Deployment

For deployment in hospital clinical networks, teaching workstations, or offline classrooms without internet connectivity, run the automated vendor asset downloader:

```bash
node scripts/download_vendor.js
```

This populates a local `vendor/` directory with offline copies of Chart.js, KaTeX, Reveal.js, Lucide, and Three.js.

---

## 📄 License

GPL-3.0 License.
