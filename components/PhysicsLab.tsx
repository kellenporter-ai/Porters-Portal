
import React, { useState, useEffect } from 'react';
import { User, LabReport } from '../types';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Save, FlaskConical } from 'lucide-react';
import { dataService } from '../services/dataService';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { useToast } from './ToastProvider';

interface PhysicsLabProps {
  user: User;
}

const PhysicsLab: React.FC<PhysicsLabProps> = ({ user }) => {
  const toast = useToast();
  const [report, setReport] = useState<LabReport>({
      id: Math.random().toString(36).substring(2, 9),
      studentId: user.id,
      labTitle: 'New Experiment',
      content: 'Observation:\n\nFormula used: $F = ma$',
      dataPoints: [],
      timestamp: new Date().toISOString()
  });

  const [previewHtml, setPreviewHtml] = useState('');
  const [newDataX, setNewDataX] = useState('');
  const [newDataY, setNewDataY] = useState('');

  // Render LaTeX on content change
  useEffect(() => {
      // Simple regex replacement for $...$ to katex html
      const rendered = report.content.replace(/\$(.*?)\$/g, (_, tex) => {
          try {
              return katex.renderToString(tex, { throwOnError: false });
          } catch {
              return tex;
          }
      }).replace(/\n/g, '<br/>');
      setPreviewHtml(rendered);
  }, [report.content]);

  const handleSave = async () => {
      await dataService.saveLabReport(report);
      await dataService.awardXP(user.id, 25);
      toast.success("Report saved!");
  };

  const addDataPoint = () => {
      const x = parseFloat(newDataX);
      const y = parseFloat(newDataY);
      if(!isNaN(x) && !isNaN(y)) {
          setReport(prev => ({
              ...prev,
              dataPoints: [...prev.dataPoints, { x, y }].sort((a,b) => a.x - b.x)
          }));
          setNewDataX('');
          setNewDataY('');
      }
  };

  return (
    <div className="h-full flex flex-col gap-6">
       <div className="flex justify-between items-center bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl">
           <h2 className="text-2xl font-bold text-blue-400 flex items-center gap-2">
               <FlaskConical className="w-6 h-6" /> Physics Laboratory
           </h2>
           <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
               <Save className="w-4 h-4" /> Save Report
           </button>
       </div>

       <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
           {/* LEFT: Simulation & Data */}
           <div className="flex flex-col gap-4">
               <div className="flex-1 bg-black rounded-xl overflow-hidden border border-white/10">
                   <iframe 
                       src="https://phet.colorado.edu/sims/html/forces-and-motion-basics/latest/forces-and-motion-basics_en.html"
                       className="w-full h-full border-none"
                       title="PhET Sim"
                   />
               </div>
               <div className="h-1/3 bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4">
                   <div className="w-1/3">
                       <h4 className="font-bold text-gray-300 mb-2 text-xs uppercase">Data Entry</h4>
                       <div className="flex gap-2 mb-2">
                           <input type="number" placeholder="X" value={newDataX} onChange={e => setNewDataX(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded p-1 text-white text-sm" />
                           <input type="number" placeholder="Y" value={newDataY} onChange={e => setNewDataY(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded p-1 text-white text-sm" />
                       </div>
                       <button onClick={addDataPoint} className="w-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-1 rounded">Add Point</button>
                   </div>
                   <div className="flex-1 min-w-0">
                       <ResponsiveContainer width="100%" height="100%">
                           <ScatterChart>
                               <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                               <XAxis type="number" dataKey="x" stroke="#666" name="X" />
                               <YAxis type="number" dataKey="y" stroke="#666" name="Y" />
                               <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{backgroundColor: '#000'}} />
                               <Scatter name="Data" data={report.dataPoints} fill="#3b82f6" />
                           </ScatterChart>
                       </ResponsiveContainer>
                   </div>
               </div>
           </div>

           {/* RIGHT: Lab Report */}
           <div className="flex flex-col bg-white/5 border border-white/10 rounded-xl overflow-hidden">
               <div className="p-2 border-b border-white/10 bg-black/20 flex gap-2">
                   <div className="text-xs text-gray-400 px-2 py-1">Mode: LaTeX Enabled ($...$)</div>
               </div>
               <div className="flex-1 flex flex-col md:flex-row min-h-0">
                   <textarea 
                       className="flex-1 bg-transparent p-4 text-sm text-gray-300 font-mono resize-none focus:outline-none border-r border-white/10"
                       value={report.content}
                       onChange={e => setReport(prev => ({...prev, content: e.target.value}))}
                       placeholder="Enter observations here. Use $E=mc^2$ for formulas."
                   />
                   <div 
                       className="flex-1 bg-white/5 p-4 text-sm text-gray-200 overflow-y-auto prose prose-invert max-w-none"
                       dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml, {
                           ADD_TAGS: ['annotation', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'mfrac', 'mtext', 'math'],
                           ADD_ATTR: ['xmlns', 'encoding']
                       }) }}
                   />
               </div>
           </div>
       </div>
    </div>
  );
};

export default PhysicsLab;
