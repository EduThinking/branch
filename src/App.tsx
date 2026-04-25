/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  Handle,
  Position,
  type NodeProps,
  Panel,
  type Connection,
  type Edge,
  MarkerType,
  type Node,
  BackgroundVariant,
  getNodesBounds,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, PenTool as GitFork, ArrowRight, Lightbulb, FileText, Share2, Download, Maximize, ZoomIn, ZoomOut, Grid, Sparkles, Loader2, X, CircleStop as AndIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { toPng } from 'html-to-image';
import { reviewCausality, reviewSolutions } from './services/geminiService';

/// --- Types ---
type NodeType = 'cause' | 'result' | 'root' | 'info' | 'and' | 'solution';

interface NodeData extends Record<string, unknown> {
  label: string;
  type?: NodeType;
  onChange: (text: string) => void;
}

type AppNode = Node<NodeData>;

// --- Custom Nodes ---
const EditableNode = ({ data, selected }: NodeProps<AppNode>) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [data.label]);

  if (data.type === 'and') {
    return (
      <div className={`w-[140px] h-[24px] rounded-[100%] bg-white flex items-center justify-center border-2 border-slate-800 shadow-md transition-all hover:scale-105 ${selected ? 'ring-4 ring-blue-100' : ''}`}>
        <Handle type="source" position={Position.Top} className="!w-2 !h-2 !bg-slate-400 !border-white" />
        <Handle type="target" position={Position.Bottom} className="!w-2 !h-2 !bg-slate-400 !border-white" />
      </div>
    );
  }

  const typeStyles = {
    cause: { border: 'border-green-500', text: 'text-green-600', label: '', handle: 'text-green-500', placeholder: '내용을 입력하세요...' },
    result: { border: 'border-red-400', text: 'text-red-500', label: '최종 결과', handle: 'text-red-400', placeholder: '내용을 입력하세요...' },
    root: { border: 'border-blue-500', text: 'text-blue-600', label: '원인 행동(상태)', handle: 'text-blue-500', placeholder: '원인 행동(상태) 입력' },
    info: { border: 'border-amber-200 bg-amber-50', text: 'text-amber-600', label: '부연 설명', handle: 'text-amber-300', placeholder: '설명 입력...' },
    solution: { border: 'border-yellow-400 bg-yellow-50', text: 'text-yellow-600', label: '해결책', handle: 'text-yellow-400', placeholder: '실행 가능한 해결책 입력...' },
    and: { border: '', text: '', label: '', handle: '', placeholder: '' }
  };

  const style = typeStyles[data.type || 'cause'];

  return (
    <div className={`w-72 px-4 py-4 shadow-sm rounded-lg bg-white border-2 transition-all flex flex-col items-center text-center ${style.border} ${selected ? 'ring-4 ring-slate-100 shadow-xl scale-105' : ''}`}>
      {/* Label/Header */}
      {style.label && (
        <div className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${style.text}`}>
          {style.label}
        </div>
      )}

      {/* Output Connection (Top) - Flow: Bottom to Top (Source at Top) */}
      {data.type !== 'result' && (
        <Handle 
          type="source" 
          position={Position.Top} 
          className={`w-3 h-3 border-2 border-white ${style.handle}`}
          style={{ color: 'currentColor' }}
        />
      )}
      
      <div className="flex flex-col gap-1 w-full pt-1">
        <textarea
          ref={textareaRef}
          className="text-sm font-bold text-[#1a1a1a] bg-transparent outline-none resize-none overflow-hidden w-full text-center placeholder:text-slate-300 leading-relaxed"
          value={data.label}
          onChange={(evt) => data.onChange(evt.target.value)}
          placeholder={style.placeholder}
          rows={1}
        />
      </div>

      {/* Input Connection (Bottom) - Flow: Bottom to Top (Target at Bottom) */}
      {data.type !== 'root' && (
        <Handle 
          type="target" 
          position={Position.Bottom} 
          className={`w-3 h-3 border-2 border-white ${style.handle}`}
          style={{ color: 'currentColor' }}
        />
      )}
    </div>
  );
};

const nodeTypes = {
  editable: EditableNode,
};

// --- Mock Data ---
const initialNodes: AppNode[] = [
  {
    id: 'n-1',
    type: 'editable',
    data: { label: '', type: 'result', onChange: (label: string) => {} },
    position: { x: 412, y: 40 },
  },
  {
    id: 'n-2',
    type: 'editable',
    data: { label: '', type: 'cause', onChange: (label: string) => {} },
    position: { x: 412, y: 230 },
  },
  {
    id: 'n-3',
    type: 'editable',
    data: { label: '', type: 'root', onChange: (label: string) => {} },
    position: { x: 412, y: 420 },
  },
];

const initialEdges: Edge[] = [];

// --- Main App Component ---
export default function App() {
  return (
    <ReactFlowProvider>
      <BranchApp />
    </ReactFlowProvider>
  );
}

function BranchApp() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isReviewing, setIsReviewing] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // Function to update node text
  const updateNodeLabel = useCallback((nodeId: string, label: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: { ...node.data, label },
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Inject functions into initial nodes
  React.useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onChange: (label: string) => updateNodeLabel(node.id, label),
        },
      }))
    );
  }, [updateNodeLabel, setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    }, eds)),
    [setEdges]
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => setEdges((els) => reconnectEdge(oldEdge, newConnection, els)),
    [setEdges]
  );

  const addNewNode = useCallback((type: NodeType = 'cause') => {
    const id = `node-${Date.now()}`;
    const newNode = {
      id,
      type: 'editable',
      data: { 
        label: '', 
        type,
        onChange: (label: string) => updateNodeLabel(id, label)
      },
      position: { 
        x: 412 + (Math.random() * 100 - 50), 
        y: 300 + (Math.random() * 100 - 50)
      },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes, updateNodeLabel]);

  const handleAiReview = async () => {
    setIsReviewing(true);
    setAiResponse(null);
    try {
      const response = await reviewCausality(nodes, edges);
      setAiResponse(response);
    } catch (err) {
      setAiResponse("검토 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleSolutionReview = async () => {
    setIsReviewing(true);
    setAiResponse(null);
    try {
      const response = await reviewSolutions(nodes, edges);
      setAiResponse(response);
    } catch (err) {
      setAiResponse("해결책 검토 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsReviewing(false);
    }
  };

  const downloadImage = async () => {
    if (reactFlowWrapper.current === null || nodes.length === 0) return;

    const viewport = reactFlowWrapper.current.querySelector('.react-flow__viewport') as HTMLElement;
    if (!viewport) return;

    // A4 dimensions at 150 DPI approx
    const a4Width = 1240;
    const a4Height = 1754;

    try {
      const nodesBounds = getNodesBounds(nodes);
      
      // Calculate transform to fit nodes and center them
      const padding = 50;
      const boundsWidth = nodesBounds.width + padding * 2;
      const boundsHeight = nodesBounds.height + padding * 2;
      
      const scaleX = a4Width / boundsWidth;
      const scaleY = a4Height / boundsHeight;
      const scale = Math.min(scaleX, scaleY, 1.5); // Max scale 1.5 to prevent pixelation
      
      const xOffset = (a4Width - nodesBounds.width * scale) / 2 - nodesBounds.x * scale;
      const yOffset = (a4Height - nodesBounds.height * scale) / 2 - nodesBounds.y * scale;

      const dataUrl = await toPng(viewport, {
        backgroundColor: '#fdfdfd',
        width: a4Width,
        height: a4Height,
        style: {
          width: `${a4Width}px`,
          height: `${a4Height}px`,
          transform: `translate(${xOffset}px, ${yOffset}px) scale(${scale})`,
        },
      });

      const a = document.createElement('a');
      a.setAttribute('download', `branch-logic-${Date.now()}.png`);
      a.setAttribute('href', dataUrl);
      a.click();
    } catch (error) {
      console.error('Download failed', error);
      alert('이미지 저장에 실패했습니다.');
    }
  };

  return (
    <div className="w-full h-screen bg-[#fdfdfd] relative flex flex-col overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="h-16 w-full border-b border-gray-200 bg-white flex items-center px-6 justify-between z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center text-white">
            <GitFork className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-lg tracking-tight text-[#1a1a1a]">가지(Branch)</span>
        </div>
        
          <div className="hidden lg:flex items-center gap-1">
            <div className="flex items-center px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
              <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-[10px] mr-2 font-bold">1</span>
              <span className="text-xs font-bold">가지 작성하기</span>
            </div>
            <div className="w-4 h-[1px] bg-gray-300 mx-1"></div>
            
            <button 
              onClick={handleAiReview}
              disabled={isReviewing}
              className={`flex items-center px-4 py-1.5 rounded-full border transition-all cursor-pointer ${
                isReviewing ? 'bg-blue-50 text-blue-700 border-blue-200' : 'text-gray-500 hover:bg-blue-600 hover:text-white hover:border-blue-600 border-gray-200 shadow-sm'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] mr-2 font-bold ${
                isReviewing ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 group-hover:bg-blue-200'
              }`}>
                {isReviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : '2'}
              </span>
              <span className="text-xs font-bold">AI로 인과관계 검토하기</span>
              <Sparkles className={`w-3 h-3 ml-1.5 ${isReviewing ? 'text-blue-500' : 'text-current opacity-70'}`} />
            </button>

            <div className="w-4 h-[1px] bg-gray-300 mx-1"></div>
            
            <button 
              onClick={handleSolutionReview}
              disabled={isReviewing}
              className={`flex items-center px-4 py-1.5 rounded-full border transition-all cursor-pointer ${
                isReviewing ? 'bg-amber-50 text-amber-700 border-amber-200' : 'text-gray-500 hover:bg-amber-500 hover:text-white hover:border-amber-500 border-gray-200 shadow-sm'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] mr-2 font-bold ${
                isReviewing ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {isReviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : '3'}
              </span>
              <span className="text-xs font-bold">AI로 해결책 검토하기</span>
              <Lightbulb className={`w-3 h-3 ml-1.5 ${isReviewing ? 'text-amber-500' : 'text-current opacity-70'}`} />
            </button>
          </div>

        <div className="flex gap-2">
          <button 
            onClick={downloadImage}
            className="px-4 py-2 text-xs font-bold bg-[#1a1a1a] text-white rounded-md hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            <Download className="w-3 h-3" />
            저장하기
          </button>
        </div>
      </nav>

      {/* Main Workspace */}
      <div className="flex-1 relative overflow-hidden" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[24, 24]}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background color="#cbd5e1" variant={BackgroundVariant.Dots} gap={24} size={showGrid ? 1 : 0} />
          <Controls 
            showZoom={false} 
            showInteractive={false} 
            position="bottom-right" 
            className="!left-auto !right-32 !bottom-8 !flex-row !shadow-none" 
          />
          
          <MiniMap 
            position="bottom-right"
            className="!bottom-8 !right-8 !w-32 !h-24 !bg-white !border !border-gray-200 !rounded !shadow-sm"
            nodeColor={(n) => {
              if (n.data?.type === 'result') return '#f87171';
              if (n.data?.type === 'cause') return '#16a34a';
              if (n.data?.type === 'root') return '#3b82f6';
              if (n.data?.type === 'and') return '#1e293b';
              if (n.data?.type === 'solution') return '#facc15';
              return '#cbd5e1';
            }}
            maskColor="rgb(241, 245, 249, 0.4)"
          />
          
          {/* Bottom Floating Toolbar */}
          <Panel position="bottom-center" className="mb-8">
            <div className="flex items-center gap-3 p-2 bg-white/90 backdrop-blur-md border border-gray-200 rounded-2xl shadow-xl z-50">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => addNewNode('cause')}
                className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg min-w-[140px] justify-center"
              >
                <Plus className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
                <span className="text-sm whitespace-nowrap">새 상자 추가</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => addNewNode('and')}
                className="flex items-center gap-2 px-5 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg min-w-[160px] justify-center"
                title="AND 조건 추가"
              >
                <AndIcon className="w-5 h-5 flex-shrink-0" />
                <span className="text-xs tracking-widest font-bold whitespace-nowrap">AND연결기호 추가</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => addNewNode('solution')}
                className="flex items-center gap-2 px-5 py-3 bg-yellow-400 text-yellow-900 rounded-xl font-bold hover:bg-yellow-500 transition-all shadow-lg min-w-[160px] justify-center"
              >
                <Lightbulb className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
                <span className="text-sm whitespace-nowrap">해결책 상자 추가</span>
              </motion.button>

              <div className="w-[1px] h-8 bg-gray-200 mx-1"></div>
              
              <div className="flex gap-1 shrink-0">
                <ToolbarButton 
                  icon={<Maximize className="w-5 h-5" />} 
                  onClick={() => fitView()} 
                  title="화면 맞춤"
                />
                <ToolbarButton 
                  icon={<ZoomIn className="w-5 h-5" />} 
                  onClick={() => zoomIn()}
                  title="확대"
                />
                <ToolbarButton 
                  icon={<ZoomOut className="w-5 h-5" />} 
                  onClick={() => zoomOut()}
                  title="축소"
                />
                <ToolbarButton 
                  icon={<Grid className={`w-5 h-5 ${showGrid ? 'text-blue-600' : 'text-gray-400'}`} />} 
                  onClick={() => setShowGrid(!showGrid)}
                  title="그리드 토글"
                />
              </div>
            </div>
          </Panel>

          {/* Instruction Tooltip */}
          <Panel position="top-right" className="mt-8 mr-8">
            <div className="bg-slate-800/90 backdrop-blur text-white text-[10px] px-4 py-2.5 rounded-xl shadow-lg pointer-events-none tracking-tight border border-white/10">
              Delete 버튼: 상자/화살표 선택 후 삭제 | 화살표: 점과 점을 연결해 인과관계 형성
            </div>
          </Panel>
        </ReactFlow>

        {/* AI Coaching Sidebar/Overlay */}
        <AnimatePresence>
          {(isReviewing || aiResponse) && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="absolute right-4 top-24 bottom-24 w-80 bg-white shadow-2xl rounded-2xl border border-gray-200 flex flex-col z-[100]"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-blue-50/50 rounded-t-2xl">
                <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                  <Sparkles className={`w-5 h-5 ${isReviewing ? 'animate-pulse' : ''}`} />
                  <span>AI 논리 코칭</span>
                </div>
                <button 
                  onClick={() => {
                    setAiResponse(null);
                    // If we can cancel the review, we would here
                  }}
                  className="p-1 hover:bg-gray-200 rounded-lg transition-colors text-gray-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 prose prose-sm prose-slate max-w-none">
                {isReviewing ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-gray-500 animate-pulse">
                      가지를 꼼꼼히 살펴보고 있어요.<br/>잠시만 기다려 주세요...
                    </p>
                  </div>
                ) : (
                  <ReactMarkdown>{aiResponse}</ReactMarkdown>
                )}
              </div>
              <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
                <p className="text-[10px] text-gray-400 text-center">
                  {isReviewing ? "생각 중..." : "코칭 내용을 참고하여 가지를 더 정교하게 다듬어보세요."}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Helper Components ---
function NavItem({ step, label }: { step: string; label: string }) {
  return (
    <div className="flex items-center px-3 py-1 text-gray-400">
      <span className="w-5 h-5 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center text-[10px] mr-2 font-bold">{step}</span>
      <span className="text-xs font-bold">{label}</span>
    </div>
  );
}

function ToolbarButton({ icon, onClick, title }: { icon: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button 
      onClick={onClick}
      title={title}
      className="p-3 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
    >
      {icon}
    </button>
  );
}
