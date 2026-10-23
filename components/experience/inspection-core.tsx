"use client";

import { useEffect, useRef, useState } from "react";
import type { MotionValue } from "motion/react";
import { createFingerprintRidges } from "./fingerprint-geometry";

/** A local procedural model: no remote assets, model downloads, or HDR requests. */
export function InspectionCore({
  progress,
  reduced,
  centered = false,
  cinematic = false,
}: {
  progress: MotionValue<number>;
  reduced: boolean;
  centered?: boolean;
  cinematic?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let cleanup = () => {};
    Promise.all([
      import("three"),
      import("three/examples/jsm/environments/RoomEnvironment.js"),
    ])
      .then(([THREE, { RoomEnvironment }]) => {
        if (disposed) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
          });
        } catch {
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.55;
        renderer.domElement.setAttribute("aria-hidden", "true");
        element.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
        camera.position.set(0, 0, 9.8);
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const environment = pmrem.fromScene(room, 0.04);
        scene.environment = environment.texture;
        room.dispose();
        const key = new THREE.DirectionalLight(0xeaffd2, 7);
        key.position.set(-3, 5, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xc4d2e9, 5);
        rim.position.set(4, -2, 3);
        scene.add(rim);
        const accent = new THREE.PointLight(0xcafa54, 15, 12);
        accent.position.set(0, 2, 3);
        scene.add(accent);
        const chrome = new THREE.MeshStandardMaterial({
          color: 0x9ba9a2,
          metalness: 1,
          roughness: 0.22,
        });
        const dark = new THREE.MeshStandardMaterial({
          color: 0x101613,
          metalness: 0.85,
          roughness: 0.28,
        });
        const lime = new THREE.MeshStandardMaterial({
          color: 0xd5ff69,
          metalness: 0.4,
          roughness: 0.24,
          emissive: 0xa2d83d,
          emissiveIntensity: 0.45,
        });
        const model = new THREE.Group();
        scene.add(model);
        const cage = new THREE.Group();
        model.add(cage);
        const parts: InstanceType<typeof THREE.Mesh>[] = [];
        [1.2, 1.57, 1.88].forEach((radius, index) => {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(
              radius,
              index === 0 ? 0.105 : 0.055,
              16,
              100,
            ),
            index === 1 ? lime : chrome,
          );
          ring.rotation.set(index * 0.4, index * 0.5, index * 0.28);
          cage.add(ring);
          parts.push(ring);
        });
        const shell = new THREE.Mesh(
          new THREE.CylinderGeometry(0.99, 0.99, 0.22, 8, 1),
          chrome,
        );
        shell.rotation.x = Math.PI / 2;
        model.add(shell);
        const disk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.87, 0.87, 0.245, 80),
          dark,
        );
        disk.rotation.x = Math.PI / 2;
        model.add(disk);
        const face = document.createElement("canvas");
        face.width = face.height = 512;
        const context = face.getContext("2d")!;
        context.fillStyle = "#101713";
        context.fillRect(0, 0, 512, 512);
        context.strokeStyle = "#344638";
        context.lineWidth = 1;
        for (let r = 120; r < 255; r += 18) {
          context.beginPath();
          context.arc(256, 256, r, 0, Math.PI * 2);
          context.stroke();
        }
        context.strokeStyle = "#d4fc71";
        context.lineWidth = 10;
        context.lineCap = "square";
        [
          [169, 198, 169, 164, 203, 164],
          [309, 164, 343, 164, 343, 198],
          [169, 314, 169, 348, 203, 348],
          [309, 348, 343, 348, 343, 314],
        ].forEach(([a, b, c, d, e, f]) => {
          context.beginPath();
          context.moveTo(a, b);
          context.lineTo(c, d);
          context.lineTo(e, f);
          context.stroke();
        });
        context.fillStyle = "#d4fc71";
        context.fillRect(208, 246, 96, 16);
        context.font = "15px monospace";
        context.textAlign = "center";
        context.fillStyle = "#879679";
        context.fillText("INSPECT / UNDERSTAND", 256, 405);
        const texture = new THREE.CanvasTexture(face);
        texture.colorSpace = THREE.SRGBColorSpace;
        const plate = new THREE.Mesh(
          new THREE.CircleGeometry(0.83, 80),
          new THREE.MeshStandardMaterial({
            map: texture,
            metalness: 0.55,
            roughness: 0.4,
          }),
        );
        plate.position.z = 0.132;
        model.add(plate);
        const ticks = new THREE.InstancedMesh(
          new THREE.BoxGeometry(0.035, 0.13, 0.08),
          chrome,
          48,
        );
        const dummy = new THREE.Object3D();
        for (let i = 0; i < 48; i++) {
          const angle = (i / 48) * Math.PI * 2;
          dummy.position.set(Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0);
          dummy.rotation.z = angle - Math.PI / 2;
          dummy.updateMatrix();
          ticks.setMatrixAt(i, dummy.matrix);
        }
        cage.add(ticks);
        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(2.22, 0.007, 8, 100),
          new THREE.MeshBasicMaterial({
            color: 0x5c713b,
            transparent: true,
            opacity: 0.5,
          }),
        );
        halo.rotation.x = -0.55;
        model.add(halo);
        const points = new Float32Array(100 * 3);
        for (let i = 0; i < 100; i++) {
          points[i * 3] = Math.sin(i * 127.1) * 9;
          points[i * 3 + 1] = Math.cos(i * 73.7) * 5;
          points[i * 3 + 2] = -2 - Math.sin(i * 31.3) * 3;
        }
        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(points, 3),
        );
        const particles = new THREE.Points(
          particleGeometry,
          new THREE.PointsMaterial({
            color: 0xb4cf89,
            size: 0.014,
            transparent: true,
            opacity: 0.5,
          }),
        );
        scene.add(particles);
        // A synthetic fingerprint: paired positions unfold from a spherical core
        // into curved ridges. No biometric data or external assets are used.
        const bio = new THREE.Group();
        scene.add(bio);
        const {
          start: ridgeStart,
          target: ridgeEnd,
          edge: ridgeEdge,
        } = createFingerprintRidges();
        const bioGeometry = new THREE.BufferGeometry();
        bioGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(ridgeStart, 3),
        );
        bioGeometry.setAttribute(
          "target",
          new THREE.Float32BufferAttribute(ridgeEnd, 3),
        );
        bioGeometry.setAttribute(
          "ridgeEdge",
          new THREE.Float32BufferAttribute(ridgeEdge, 1),
        );
        const bioMaterial = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: {
            morph: { value: 0 },
            reveal: { value: 0 },
            sweep: { value: 0 },
            tint: { value: new THREE.Color(0xcafa78) },
          },
          vertexShader: `attribute vec3 target; attribute float ridgeEdge; uniform float morph; varying vec3 pos; varying float edge;
            void main(){ edge=ridgeEdge; pos = mix(position,target,morph); gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.); }`,
          fragmentShader: `uniform float reveal; uniform float sweep; uniform vec3 tint; varying vec3 pos; varying float edge;
            void main(){ float band=exp(-pow((pos.y-sweep)*7.,2.)); float ridge=1.-smoothstep(.45,1.,abs(edge));
              float pad=1.-smoothstep(.85,1.08,length(vec2(pos.x/1.08,pos.y/1.65)));
              gl_FragColor=vec4(mix(tint,vec3(.8,1.,.92),band*.7),reveal*ridge*pad*(.7+band*.3)); }`,
        });
        const fingerprint = new THREE.Mesh(bioGeometry, bioMaterial);
        bio.add(fingerprint);
        const scanMaterial = new THREE.MeshBasicMaterial({
          color: 0xa3ffe3,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const scan = new THREE.Mesh(
          new THREE.PlaneGeometry(2.8, 0.018),
          scanMaterial,
        );
        scan.position.z = 0.35;
        bio.add(scan);
        const smoothstep = (a: number, b: number, v: number) => {
          const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
          return t * t * (3 - 2 * t);
        };
        const solidMaterials = [chrome, dark, lime, plate.material];
        if (cinematic)
          solidMaterials.forEach((material) => {
            material.transparent = true;
          });
        let visible = true;
        let width = element.clientWidth;
        const mobileStoryMedia = window.matchMedia(
          "(max-width: 700px), (max-width: 950px) and (max-height: 500px) and (pointer: coarse)",
        );
        let pointerX = 0;
        let pointerY = 0;
        const render = (time = 0) => {
          const p = progress.get();
          const idle = reduced ? 0 : time * 0.00012;
          const mobile = width < 760;
          model.position.x = centered || mobile ? 0 : 1.55 - p * 0.2;
          model.position.y =
            (centered ? 0 : mobile ? -0.35 : 0.08) +
            (reduced ? 0 : Math.sin(idle * 2) * 0.055);
          model.rotation.set(
            0.12 + p * 0.65 + pointerY * 0.1,
            -0.38 + p * 2.4 + pointerX * 0.12,
            -0.18 + p * 0.3,
          );
          const s = centered ? 0.95 : mobile ? 0.76 : 1.12;
          model.scale.setScalar(s * (1 - p * 0.11));
          parts.forEach((ring, i) => {
            ring.rotation.x =
              i * 0.4 + p * (i + 1) * 0.7 + idle * (i % 2 ? -0.5 : 0.3);
            ring.rotation.y = i * 0.5 + p * (i + 1) * 0.9;
            ring.position.z = (i - 1) * p * 0.8;
          });
          plate.position.z = 0.132 + p * 0.65;
          shell.position.z = -p * 0.4;
          ticks.rotation.z = -p * 0.8 - idle * 0.15;
          halo.rotation.z = p * 1.4 + idle * 0.2;
          particles.rotation.z = idle * 0.02;
          if (cinematic) {
            const mobileStory = mobileStoryMedia.matches;
            const arrival = smoothstep(0.015, 0.23, p);
            const unfold = smoothstep(0.22, 0.56, p);
            const dissolve = smoothstep(0.28, 0.53, p);
            const aspect = element.clientWidth / element.clientHeight;
            const viewWidth =
              2 *
              Math.tan(THREE.MathUtils.degToRad(17)) *
              camera.position.z *
              aspect;
            model.position.x = mobile ? 0 : viewWidth * 0.235 * (1 - arrival);
            model.position.y = mobileStory ? 0.12 : 0;
            const sceneScale = mobileStory
              ? 1.03
              : mobile
                ? 0.72
                : THREE.MathUtils.lerp(1.02, 0.7, arrival);
            model.scale.setScalar(sceneScale);
            model.rotation.set(
              0.1 + unfold * 0.3,
              -0.38 + arrival * 0.6 + unfold * 0.5,
              -0.12 + unfold * 0.2,
            );
            parts.forEach((ring, i) => {
              ring.rotation.x =
                i * 0.4 +
                unfold * (i + 1) * 1.1 +
                (mobileStory ? Math.sin(idle * 0.5) * 0.045 : idle * 0.1);
              ring.rotation.y = i * 0.5 + unfold * (i + 1) * 0.7;
              ring.position.z = (i - 1) * unfold * (mobileStory ? 0.55 : 1.5);
              ring.scale.setScalar(1 + unfold * (mobileStory ? 0.1 : 0.22));
            });
            solidMaterials.forEach((material) => {
              material.opacity = 1 - dissolve;
              material.depthWrite = dissolve < 0.5;
            });
            plate.scale.setScalar(1 - dissolve * 0.85);
            disk.scale.setScalar(1 - dissolve * 0.85);
            shell.scale.setScalar(1 - dissolve * 0.85);
            halo.material.opacity = 0.3 * (1 - dissolve);
            halo.rotation.x = THREE.MathUtils.lerp(-0.55, 0.15, unfold);
            bio.position.copy(model.position);
            bio.scale.setScalar(sceneScale * 1.35);
            bio.rotation.set(
              mobileStory ? 0 : -0.04,
              Math.sin(p * 5) * (mobileStory ? 0.035 : 0.12),
              mobileStory ? 0 : -0.035,
            );
            particles.material.opacity = mobileStory ? 0.18 : 0.5;
            bioMaterial.uniforms.morph.value = unfold;
            bioMaterial.uniforms.reveal.value = smoothstep(0.25, 0.48, p);
            bioMaterial.uniforms.sweep.value = reduced
              ? 0.2
              : Math.sin(p * 28 + idle * 1.5) * 1.65;
            bioMaterial.uniforms.tint.value.set(p > 0.65 ? 0x99e9dd : 0xcafa78);
            scan.position.y = bioMaterial.uniforms.sweep.value;
            scanMaterial.opacity = unfold * 0.18;
          }
          bio.visible = cinematic;
          renderer.render(scene, camera);
        };
        const resize = () => {
          width = element.clientWidth;
          const height = element.clientHeight;
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          render();
        };
        const observe = new ResizeObserver(resize);
        observe.observe(element);
        resize();
        const onPointer = (event: PointerEvent) => {
          pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
          pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
        };
        element.addEventListener("pointermove", onPointer);
        const visibility = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          updateLoop();
        });
        visibility.observe(element);
        const updateLoop = () => {
          renderer.setAnimationLoop(
            visible && !document.hidden && !reduced ? render : null,
          );
          if (visible) render();
        };
        document.addEventListener("visibilitychange", updateLoop);
        const off = progress.on("change", () => {
          if (reduced && visible) render();
        });
        const lost = (event: Event) => {
          event.preventDefault();
          setReady(false);
          renderer.setAnimationLoop(null);
        };
        renderer.domElement.addEventListener("webglcontextlost", lost);
        updateLoop();
        setReady(true);
        cleanup = () => {
          renderer.setAnimationLoop(null);
          off();
          observe.disconnect();
          visibility.disconnect();
          document.removeEventListener("visibilitychange", updateLoop);
          element.removeEventListener("pointermove", onPointer);
          renderer.domElement.removeEventListener("webglcontextlost", lost);
          scene.traverse((object) => {
            if (
              object instanceof THREE.Mesh ||
              object instanceof THREE.Points ||
              object instanceof THREE.LineSegments
            ) {
              object.geometry.dispose();
              const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
              materials.forEach((material) => material.dispose());
            }
          });
          texture.dispose();
          environment.dispose();
          pmrem.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => setReady(false));
    return () => {
      disposed = true;
      cleanup();
    };
  }, [progress, reduced, centered, cinematic]);
  return (
    <div
      ref={host}
      className={`inspection-canvas ${ready ? "is-ready" : ""}`}
      role="img"
      aria-label={
        cinematic
          ? "A metallic inspection core moves to the center and unfolds into a synthetic fingerprint hologram as you scroll."
          : "An interactive metallic inspection core. Its concentric rings separate and rotate as you scroll."
      }
    >
      <div className="core-fallback" aria-hidden="true">
        <span />
        <span />
        <span />
        <b>
          SC<span>—</span>
        </b>
      </div>
    </div>
  );
}
