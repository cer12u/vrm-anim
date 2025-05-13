import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { 
  VRMLookAtQuaternionProxy, 
  createVRMAnimationClip, 
  VRMAnimationLoaderPlugin 
} from '@pixiv/three-vrm-animation';

const App = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [message, setMessage] = useState<string>('VRMファイルをアップロードしてください');
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationActionRef = useRef<THREE.AnimationAction | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x303030);
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(
      45, 
      containerRef.current.clientWidth / containerRef.current.clientHeight, 
      0.1, 
      100
    );
    camera.position.set(0, 1.5, 3);
    cameraRef.current = camera;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.screenSpacePanning = true;
    controls.update();
    controlsRef.current = controls;
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);
    
    const animate = () => {
      requestAnimationFrame(animate);
      
      const delta = clockRef.current.getDelta();
      
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }
      
      if (vrm) {
        vrm.update(delta);
      }
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    animate();
    
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, []);
  
  const handleVrmUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const fileURL = URL.createObjectURL(file);
    
    setMessage(`${file.name} を読み込み中...`);
    
    if (vrm) {
      sceneRef.current?.remove(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
      setVrm(null);
    }
    
    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      
      const gltf = await loader.loadAsync(fileURL);
      const loadedVrm = gltf.userData.vrm as VRM;
      
      VRMUtils.rotateVRM0(loadedVrm);
      
      VRMUtils.removeUnnecessaryVertices(loadedVrm.scene);
      VRMUtils.removeUnnecessaryJoints(loadedVrm.scene);
      
      loadedVrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });
      
      if (sceneRef.current) {
        sceneRef.current.add(loadedVrm.scene);
        
        if (loadedVrm.lookAt) {
          const lookAtProxy = new VRMLookAtQuaternionProxy(loadedVrm.lookAt);
          lookAtProxy.name = 'lookAtQuaternionProxy';
          loadedVrm.scene.add(lookAtProxy);
        }
        
        const mixer = new THREE.AnimationMixer(loadedVrm.scene);
        mixerRef.current = mixer;
        
        setVrm(loadedVrm);
        setMessage(`${file.name} を読み込みました`);
      }
    } catch (error) {
      console.error('VRMファイルの読み込みに失敗しました:', error);
      setMessage('VRMファイルの読み込みに失敗しました');
    } finally {
      URL.revokeObjectURL(fileURL);
    }
  };
  
  const handleAnimationUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !vrm || !mixerRef.current) {
      setMessage('先にVRMモデルを読み込んでください');
      return;
    }
    
    const file = files[0];
    const fileURL = URL.createObjectURL(file);
    
    setMessage(`アニメーションファイル ${file.name} を読み込み中...`);
    
    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      
      const gltf = await loader.loadAsync(fileURL);
      
      if (!gltf.userData.vrmAnimations || gltf.userData.vrmAnimations.length === 0) {
        throw new Error('VRMアニメーションが見つかりませんでした');
      }
      
      const vrmAnimation = gltf.userData.vrmAnimations[0];
      
      const clip = createVRMAnimationClip(vrmAnimation, vrm);
      
      if (animationActionRef.current) {
        animationActionRef.current.stop();
      }
      
      const action = mixerRef.current.clipAction(clip);
      action.clampWhenFinished = false;
      action.loop = THREE.LoopRepeat;
      action.play();
      
      animationActionRef.current = action;
      setIsPlaying(true);
      setMessage(`アニメーション ${file.name} を再生中`);
    } catch (error) {
      console.error('アニメーションファイルの読み込みに失敗しました:', error);
      setMessage('アニメーションファイルの読み込みに失敗しました');
    } finally {
      URL.revokeObjectURL(fileURL);
    }
  };
  
  const toggleAnimation = () => {
    if (!animationActionRef.current) {
      console.warn('No animation action available to toggle');
      return;
    }
    
    if (isPlaying) {
      animationActionRef.current.paused = true;
      setIsPlaying(false);
      setMessage('アニメーションを一時停止しました');
    } else {
      animationActionRef.current.paused = false;
      setIsPlaying(true);
      setMessage('アニメーションを再生中');
    }
  };
  
  return (
    <div className="container">
      <div className="controls">
        <label className="file-input-label">
          VRMファイルを選択
          <input 
            type="file" 
            accept=".vrm" 
            onChange={handleVrmUpload} 
          />
        </label>
        
        <label className="file-input-label">
          アニメーションファイルを選択
          <input 
            type="file" 
            accept=".vrma" 
            onChange={handleAnimationUpload} 
            disabled={!vrm}
          />
        </label>
        
        <button 
          onClick={toggleAnimation} 
          disabled={!animationActionRef.current || !vrm}
        >
          {isPlaying ? '一時停止' : '再生'}
        </button>
        
        <div>{message}</div>
      </div>
      
      <div className="scene-container" ref={containerRef}></div>
    </div>
  );
};

export default App;
