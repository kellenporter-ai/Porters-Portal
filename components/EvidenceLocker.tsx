
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, EvidenceLog } from '../types';
import { Upload, Camera, Clock, FileText, Download, Loader2, CheckCircle, ChevronRight, Image as ImageIcon, ChevronDown } from 'lucide-react';
import exifr from 'exifr';
import { dataService } from '../services/dataService';
import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// @ts-ignore
import { jsPDF } from 'jspdf';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

interface EvidenceLockerProps {
  user: User;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
type DayName = typeof DAYS_OF_WEEK[number];

const EvidenceLocker: React.FC<EvidenceLockerProps> = ({ user }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const currentWeekId = useMemo(() => dataService.getWeekId(), []);
  const [logs, setLogs] = useState<EvidenceLog[]>([]);
  const [activeDay, setActiveDay] = useState<DayName>('Monday');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Class Selection
  const enrolledClasses = user.enrolledClasses || (user.classType ? [user.classType] : []);
  const [selectedClass, setSelectedClass] = useState<string>(user.classType || enrolledClasses[0] || 'Uncategorized');

  // Set active day to current day if it's a weekday
  useEffect(() => {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      if ((DAYS_OF_WEEK as readonly string[]).includes(today)) {
          setActiveDay(today as DayName);
      }
  }, []);

  useEffect(() => {
    const unsub = dataService.subscribeToEvidence(user.id, currentWeekId, setLogs);
    return () => unsub();
  }, [user.id, currentWeekId]);

  // Filter logs for the selected class. 
  // FIX: Pin legacy items (no classType) to the PRIMARY class only, to prevent them from floating between views.
  const classLogs = useMemo(() => {
      const primaryClass = enrolledClasses[0] || 'Uncategorized';
      return logs.filter(l => {
          // New items: Strict match
          if (l.classType) return l.classType === selectedClass;
          
          // Legacy items: Only show if we are viewing the primary class
          // This prevents "floating" where legacy items appear in whichever class is currently selected.
          return selectedClass === primaryClass;
      });
  }, [logs, selectedClass, enrolledClasses]);

  const getLogForDay = (day: DayName) => classLogs.find(l => l.dayOfWeek === day);

  const formatExifDate = (date: Date | string | null) => {
      if (!date) return null;
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
      });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
        let exifDate = null;
        if (file.type.startsWith('image/')) {
            try {
                const exif = await exifr.parse(file, ['DateTimeOriginal']) || {};
                if (exif.DateTimeOriginal) {
                    exifDate = exif.DateTimeOriginal.toISOString();
                }
            } catch (exifErr) { 
                console.warn("EXIF extraction failed", exifErr); 
            }
        }
        
        // Generate Unique ID that includes Class to separate uploads per class per day
        const safeClass = selectedClass.replace(/[^a-zA-Z0-9]/g, '_');
        const uniqueId = Math.random().toString(36).substring(2, 9);
        const storageRef = ref(storage, `evidence/${user.id}/${currentWeekId}/${safeClass}_${activeDay}_${uniqueId}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        const existingLog = getLogForDay(activeDay);
        
        // ID Format: userID_Week_Day_Class
        const docId = `${user.id}_${currentWeekId}_${activeDay}_${safeClass}`;

        const newLog: EvidenceLog = {
            id: docId,
            studentId: user.id,
            weekId: currentWeekId,
            classType: selectedClass,
            dayOfWeek: activeDay,
            imageUrl: url,
            timestamp: new Date().toISOString(),
            exifDate: exifDate,
            reflection: existingLog?.reflection || ''
        };

        await dataService.uploadEvidence(newLog);
    } catch (err) {
        toast.error("Upload failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReflectionChange = async (day: DayName, text: string) => {
      const log = getLogForDay(day);
      if (log && log.reflection !== text) {
          await dataService.uploadEvidence({ ...log, reflection: text });
      }
  };

  const generatePDF = async () => {
      if (classLogs.length === 0) return;

      const confirmed = await confirm({
          title: "Generate & Delete Evidence",
          message: `WARNING: Generating this report will DELETE all ${selectedClass} photos and reflections for this week from the server to save space. Make sure you save the downloaded PDF immediately.`,
          confirmLabel: "Generate PDF",
          variant: "warning"
      });
      if (!confirmed) return;

      setIsGeneratingPdf(true);
      
      try {
          // jsPDF types are incomplete — cast to access internal APIs
          const doc = new jsPDF() as InstanceType<typeof jsPDF> & Record<string, any>;
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const margin = 20;
          const contentWidth = pageWidth - (margin * 2);
          const maxY = pageHeight - margin; 
          
          // --- HEADER PAGE 1 ---
          doc.setFillColor(15, 7, 32); 
          doc.rect(0, 0, pageWidth, 40, 'F');
          
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(22);
          doc.setFont('helvetica', 'bold');
          doc.text("WEEKLY PROGRESS REPORT", margin, 18);
          
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(`Operative: ${user.name.toUpperCase()}`, margin, 28);
          doc.text(`Class: ${selectedClass}`, margin, 33);
          doc.text(`Cycle ID: ${currentWeekId}`, margin, 38);
          doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, 33, { align: 'right' });

          let yPos = 55;

          const sortedLogs = [...classLogs].sort((a, b) => 
              DAYS_OF_WEEK.indexOf(a.dayOfWeek) - DAYS_OF_WEEK.indexOf(b.dayOfWeek)
          );

          for (const log of sortedLogs) {
              let imgBase64 = null;
              let imgFormat = 'JPEG';
              let finalImgWidth = 0;
              let finalImgHeight = 0;
              let imageError = false;

              try {
                  const response = await fetch(log.imageUrl);
                  if (!response.ok) throw new Error(`Image fetch failed: ${response.statusText}`);
                  const imgBlob = await response.blob();
                  
                  imgBase64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(imgBlob);
                  });

                  if (imgBlob.type === 'image/png') imgFormat = 'PNG';
                  if (imgBlob.type === 'image/webp') imgFormat = 'WEBP';

                  const imgProps = doc.getImageProperties(imgBase64);
                  const imgRatio = imgProps.width / imgProps.height;
                  
                  const maxHeight = 100;
                  finalImgWidth = contentWidth;
                  finalImgHeight = finalImgWidth / imgRatio;

                  if (finalImgHeight > maxHeight) {
                      finalImgHeight = maxHeight;
                      finalImgWidth = finalImgHeight * imgRatio;
                  }
              } catch (e) {
                  console.warn("Image processing error for PDF", e);
                  imageError = true;
                  finalImgHeight = 15;
              }

              const headerHeight = 20; 
              const imageSpacing = 12; 
              const totalBlockHeight = headerHeight + finalImgHeight + imageSpacing;

              if (yPos + totalBlockHeight > maxY) {
                  doc.addPage();
                  yPos = margin;
              }

              doc.setDrawColor(200, 200, 200);
              doc.setLineWidth(0.5);
              doc.line(margin, yPos, pageWidth - margin, yPos);
              yPos += 6;
              
              doc.setTextColor(15, 7, 32);
              doc.setFontSize(16);
              doc.setFont('helvetica', 'bold');
              doc.text(log.dayOfWeek.toUpperCase(), margin, yPos);
              
              const dateDisplay = formatExifDate(log.exifDate) || formatExifDate(log.timestamp);
              doc.setFontSize(9);
              doc.setFont('helvetica', 'italic');
              doc.setTextColor(100, 100, 100);
              doc.text(`Captured: ${dateDisplay}`, pageWidth - margin, yPos, { align: 'right' });
              
              yPos += 10; 

              if (!imageError && imgBase64) {
                  const xOffset = (pageWidth - finalImgWidth) / 2;
                  doc.addImage(imgBase64, imgFormat, xOffset, yPos, finalImgWidth, finalImgHeight);
                  yPos += finalImgHeight + 12;
              } else {
                  doc.setTextColor(255, 0, 0);
                  doc.setFontSize(8);
                  doc.text(`[Image Error]`, margin, yPos);
                  yPos += 15;
              }

              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              const reflectionContent = log.reflection || "No reflection logged for this cycle.";
              const splitText = doc.splitTextToSize(reflectionContent, contentWidth);
              const textBlockHeight = (splitText.length * 5) + 15; 

              if (yPos + textBlockHeight > maxY) {
                  doc.addPage();
                  yPos = margin;
              }

              doc.setTextColor(15, 7, 32);
              doc.setFontSize(11);
              doc.setFont('helvetica', 'bold');
              doc.text("DAILY REFLECTION:", margin, yPos);
              yPos += 6;
              
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(60, 60, 60);
              doc.text(splitText, margin, yPos);
              
              yPos += (splitText.length * 5) + 25; 
          }

          doc.save(`Report_${selectedClass.replace(/\s+/g, '')}_${user.name.replace(/\s+/g, '_')}_${currentWeekId}.pdf`);
          
          // Cleanup after successful generation
          await dataService.deleteWeeklyEvidence(classLogs);
          toast.success("PDF generated and evidence cleared.");
          // UI update happens via subscription

      } catch (err) {
          console.error("PDF generation failed:", err);
          toast.error("Failed to build report. Data was NOT deleted. Check console for details.");
      } finally {
          setIsGeneratingPdf(false);
      }
  };

  const activeLog = getLogForDay(activeDay);

  return (
    <div className="h-full flex flex-col space-y-6">
        {/* Header Section */}
        <div className="bg-emerald-900/20 border border-emerald-500/30 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h2 className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
                    <Camera className="w-7 h-7" /> Weekly Evidence Log
                </h2>
                <div className="flex items-center gap-2 mt-1">
                    {enrolledClasses.length > 1 ? (
                        <div className="relative group">
                            <select 
                                value={selectedClass} 
                                onChange={(e) => setSelectedClass(e.target.value)}
                                className="appearance-none bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs font-bold py-1 pl-3 pr-8 rounded-lg cursor-pointer hover:bg-emerald-500/20 transition focus:outline-none"
                            >
                                {enrolledClasses.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-400 pointer-events-none" />
                        </div>
                    ) : (
                        <span className="text-emerald-200/60 text-sm font-bold">{selectedClass}</span>
                    )}
                    <span className="text-emerald-200/40 text-sm">| Upload photos of lab work & notes.</span>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="bg-black/40 px-4 py-2 rounded-lg border border-emerald-500/20 text-center">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest block">Cycle ID</span>
                    <span className="font-mono text-emerald-400 font-bold">{currentWeekId}</span>
                </div>
                <button 
                    onClick={generatePDF}
                    disabled={isGeneratingPdf || classLogs.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition group"
                >
                    {isGeneratingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5 group-hover:bounce" />}
                    Save Report (PDF)
                </button>
            </div>
        </div>

        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept="image/*" 
        />

        {/* Tab Navigation */}
        <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto custom-scrollbar">
            {DAYS_OF_WEEK.map(day => {
                const dayLog = getLogForDay(day);
                const isActive = activeDay === day;
                return (
                    <button
                        key={day}
                        onClick={() => setActiveDay(day)}
                        className={`flex-1 min-w-[100px] flex flex-col items-center py-3 rounded-lg transition-all relative group ${
                            isActive 
                                ? 'bg-emerald-600 text-white shadow-lg' 
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                        }`}
                    >
                        <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isActive ? 'text-emerald-100' : 'text-gray-500 group-hover:text-gray-300'}`}>Day {DAYS_OF_WEEK.indexOf(day) + 1}</span>
                        <span className="font-bold text-sm">{day}</span>
                        {dayLog && (
                            <div className={`absolute top-2 right-2 ${isActive ? 'text-emerald-200' : 'text-emerald-500'}`}>
                                <CheckCircle className="w-3 h-3" />
                            </div>
                        )}
                    </button>
                );
            })}
        </div>

        {/* Main Active Day Content - Vertical Layout for Widescreen Images */}
        <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col gap-6">
            
            {/* Top: Image Upload Area (Takes available space) */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-widest">
                        <ImageIcon className="w-4 h-4" /> Evidence Capture ({selectedClass})
                    </h3>
                    {activeLog && (
                        <div className="text-[9px] bg-black/40 px-2 py-0.5 rounded border border-white/10 text-gray-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatExifDate(activeLog.exifDate) || formatExifDate(activeLog.timestamp)}
                        </div>
                    )}
                </div>

                <div className="flex-1 bg-black/40 rounded-xl border-2 border-dashed border-white/10 relative group overflow-hidden transition-all hover:border-emerald-500/30">
                    {activeLog ? (
                        <>
                            <img src={activeLog.imageUrl} alt={activeDay} className="w-full h-full object-contain bg-black/20" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-4 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="w-8 h-8 text-emerald-400" />
                                <span className="text-white font-bold text-sm">Replace Evidence</span>
                            </div>
                        </>
                    ) : (
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full h-full flex flex-col items-center justify-center text-gray-500 hover:text-emerald-400 hover:bg-white/5 transition gap-3"
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
                            ) : (
                                <div className="p-4 bg-white/5 rounded-full mb-2 group-hover:scale-110 transition shadow-xl">
                                    <Camera className="w-8 h-8" />
                                </div>
                            )}
                            <div className="text-center">
                                <span className="text-sm font-bold uppercase tracking-widest block">Upload Photo</span>
                                <span className="text-[10px] opacity-60">Supports JPG, PNG, WEBP</span>
                            </div>
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom: Reflection Area (Fixed Height) */}
            <div className="h-48 md:h-56 flex flex-col flex-shrink-0">
                <div className="mb-2">
                    <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-widest">
                        <FileText className="w-4 h-4" /> Daily Reflection
                    </h3>
                </div>

                {activeLog ? (
                    <textarea 
                        key={activeDay}
                        className="flex-1 w-full bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-emerald-500/50 focus:bg-black/40 transition placeholder-gray-600 leading-relaxed custom-scrollbar"
                        placeholder={`Document your findings for ${activeDay} in ${selectedClass}...`}
                        defaultValue={activeLog.reflection}
                        onBlur={(e) => handleReflectionChange(activeDay, e.target.value)}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-600 italic text-center px-10 border border-white/5 rounded-xl bg-white/5">
                        <div className="mb-2 opacity-30">
                            <ChevronRight className="w-6 h-6" />
                        </div>
                        <p className="font-medium text-sm">Reflection Locked</p>
                        <p className="text-[10px] mt-1 max-w-[200px]">Upload evidence photo to unlock the reflection journal for this day.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default EvidenceLocker;
