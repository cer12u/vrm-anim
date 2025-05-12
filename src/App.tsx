import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimation, VRMLookAtQuaternionProxy, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

const App = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [animation, setAnimation] = useState<VRMAnimation | null>(null);
  const [_lookAtProxy, setLookAtProxy] = useState<VRMLookAtQuaternionProxy | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [message, setMessage] = useState<string>('VRMファイルをアップロードしてください');
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
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
  
  const handleVrmUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
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
    
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    
    loader.load(
      fileURL,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        
        VRMUtils.rotateVRM0(vrm);
        
        if (sceneRef.current) {
          sceneRef.current.add(vrm.scene);
          setVrm(vrm);
          
          if (vrm.lookAt) {
            console.log('VRM LookAt component found:', vrm.lookAt);
            const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
            console.log('Created VRMLookAtQuaternionProxy:', proxy);
            
            proxy.name = 'vrmLookAtProxy';
            vrm.scene.add(proxy);
            
            (window as any).vrmLookAtProxy = proxy;
            
            console.log('Added proxy to scene:', vrm.scene);
            setLookAtProxy(proxy);
          } else {
            console.warn('VRM model does not have a lookAt component');
          }
          
          setMessage(`${file.name} を読み込みました`);
          
          const mixer = new THREE.AnimationMixer(vrm.scene);
          mixerRef.current = mixer;
        }
      },
      (progress) => {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        setMessage(`${file.name} を読み込み中... ${percentage}%`);
      },
      (error) => {
        console.error('VRMファイルの読み込みに失敗しました:', error);
        setMessage('VRMファイルの読み込みに失敗しました');
      }
    );
    
    URL.revokeObjectURL(fileURL);
  };
  
  const handleAnimationUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !vrm) return;
    
    const file = files[0];
    const fileURL = URL.createObjectURL(file);
    
    setMessage(`アニメーションファイル ${file.name} を読み込み中...`);
    
    console.log('Current VRM LookAt proxy from global:', (window as any).vrmLookAtProxy);
    console.log('Current VRM scene children:', vrm.scene.children);
    
    const proxyInScene = vrm.scene.children.find(child => child.name === 'vrmLookAtProxy');
    console.log('Found proxy in scene:', proxyInScene);
    
    if (!vrm.lookAt) {
      console.warn('VRM model does not have a lookAt component, creating one might fail');
    } else {
      console.log('VRM LookAt component exists:', vrm.lookAt);
    }
    
    const loader = new GLTFLoader();
    
    loader.load(
      fileURL,
      (_gltf) => {
        if (!vrm || !mixerRef.current) {
          setMessage('先にVRMモデルを読み込んでください');
          return;
        }
        
        console.log('Creating VRMAnimation');
        const vrmAnimation = new VRMAnimation();
        vrmAnimation.humanoidTracks = {
          translation: new Map(),
          rotation: new Map()
        };
        setAnimation(vrmAnimation);
        
        if (!proxyInScene && vrm.lookAt) {
          console.log('Creating new proxy before animation clip creation');
          const newProxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
          newProxy.name = 'vrmLookAtProxy';
          vrm.scene.add(newProxy);
          console.log('Added new proxy to scene:', newProxy);
        }
        
        console.log('Creating VRM animation clip with VRM:', vrm);
        const clip = createVRMAnimationClip(vrmAnimation, vrm);
        console.log('Created animation clip:', clip);
        
        if (clip) {
          console.log('Creating animation action with mixer');
          const action = mixerRef.current.clipAction(clip);
          action.reset();
          action.play();
          setIsPlaying(true);
          setMessage(`アニメーション ${file.name} を再生中`);
        } else {
          console.error('Failed to create animation clip');
          setMessage('アニメーションの適用に失敗しました');
        }
      },
      (progress) => {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        setMessage(`アニメーションファイル ${file.name} を読み込み中... ${percentage}%`);
      },
      (error) => {
        console.error('アニメーションファイルの読み込みに失敗しました:', error);
        setMessage('アニメーションファイルの読み込みに失敗しました');
      }
    );
    
    URL.revokeObjectURL(fileURL);
  };
  
  const toggleAnimation = () => {
    if (!mixerRef.current || !animation || !vrm) return;
    
    const clip = createVRMAnimationClip(animation, vrm);
    const actions = mixerRef.current.clipAction(clip);
    
    if (isPlaying) {
      actions.paused = true;
      setIsPlaying(false);
      setMessage('アニメーションを一時停止しました');
    } else {
      actions.paused = false;
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
            accept=".fbx,.glb,.gltf" 
            onChange={handleAnimationUpload} 
            disabled={!vrm}
          />
        </label>
        
        <button 
          onClick={toggleAnimation} 
          disabled={!animation || !vrm}
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
