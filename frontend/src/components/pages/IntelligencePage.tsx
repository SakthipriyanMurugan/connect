import React, { useState } from 'react';
import { 
  ShieldCheck, 
  AlertCircle, 
  Clock, 
  RotateCcw,
  Check,
  Volume2,
  Sparkles,
  PhoneCall
} from 'lucide-react';

interface IntelligencePageProps {
  onShowToast: (msg: string) => void;
}

interface CallEvaluation {
  id: string;
  agent: string;
  customer: string;
  duration: string;
  date: string;
  language: string;
  overallScore: number;
  status: 'pending' | 'approved' | 'amended';
  summary: string;
  dimensions: {
    name: string;
    weight: number;
    score: number;
    assessment: string;
    evidence: string;
    timestamp: string;
    confidence: string;
  }[];
}

export const IntelligencePage: React.FC<IntelligencePageProps> = ({ onShowToast }) => {
  const [callRecords, setCallRecords] = useState<CallEvaluation[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [supervisorNote, setSupervisorNote] = useState('');

  // Function to simulate real call analysis on demand
  const handleGenerateSampleEvaluation = () => {
    const newEvaluation: CallEvaluation = {
      id: 'call-' + Date.now(),
      agent: 'Active User (Agent)',
      customer: 'Business Client',
      duration: '04:15 min',
      date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      language: 'Tamil + English (Code-switching)',
      overallScore: 94,
      status: 'pending',
      summary: 'Customer enquired about platform deployment and Tamil speech transcription accuracy. Agent provided clear step-by-step guidance.',
      dimensions: [
        {
          name: 'Communication clarity',
          weight: 15,
          score: 14,
          assessment: 'Clear, well-paced explanations with accurate technical terminology in Tamil & English.',
          evidence: '[01:12] "Docker compose மூலமாக local-லேயே zero-cost-ல setup பண்ண முடியும் சார்..."',
          timestamp: '01:12',
          confidence: '96%',
        },
        {
          name: 'Professional courtesy',
          weight: 15,
          score: 15,
          assessment: 'Respectful, professional, warm greeting and polite closing.',
          evidence: '[00:05] "வணக்கம் சார், JM Vertex Connect-க்கு வரவேற்கிறோம்..."',
          timestamp: '00:05',
          confidence: '99%',
        },
        {
          name: 'Active listening',
          weight: 15,
          score: 14,
          assessment: 'Acknowledged customer requirements regarding privacy and tenant isolation without interruption.',
          evidence: '[02:30] "Exactly, multi-tenant isolation database level-லேயே enforce பண்ணியிருக்கோம்..."',
          timestamp: '02:30',
          confidence: '94%',
        },
        {
          name: 'Problem solving',
          weight: 20,
          score: 19,
          assessment: 'Offered instant solution for audio/video calling latency using LiveKit SFU.',
          evidence: '[03:45] "WebRTC P2P direct connectivity allows zero server bandwidth consumption for 1-to-1 calls."',
          timestamp: '03:45',
          confidence: '95%',
        },
        {
          name: 'Product / process accuracy',
          weight: 15,
          score: 14,
          assessment: 'Accurately stated compliance and consent notices before call recording.',
          evidence: '[00:15] "இந்த அழைப்பு தர பரிசோதனைக்காக பதிவு செய்யப்படுகிறது..."',
          timestamp: '00:15',
          confidence: '95%',
        },
        {
          name: 'Conversation management',
          weight: 10,
          score: 9,
          assessment: 'Kept call focused on topic and clearly outlined follow-up demo timeline.',
          evidence: '[03:50] "நாளைக்கு காலை 11 மணிக்கு live pilot demo schedule பண்ணியிருக்கேன் சார்."',
          timestamp: '03:50',
          confidence: '91%',
        },
        {
          name: 'Policy / compliance',
          weight: 10,
          score: 9,
          assessment: 'Consent recorded properly, customer informed about retention policy.',
          evidence: '[00:20] "Consent confirmed by user click and verbal notice."',
          timestamp: '00:20',
          confidence: '92%',
        },
      ],
    };

    setCallRecords([newEvaluation]);
    setSelectedCallId(newEvaluation.id);
    onShowToast('AI Call Intelligence analyzed audio transcript and generated 7-dimension scorecard!');
  };

  const currentCall = callRecords.find((c) => c.id === selectedCallId) || callRecords[0];

  const handleApprove = () => {
    if (!currentCall) return;
    setCallRecords(callRecords.map(c => c.id === currentCall.id ? { ...c, status: 'approved' } : c));
    onShowToast('AI Scorecard approved by Supervisor with permanent audit log entry.');
  };

  const handleAmend = () => {
    if (!currentCall) return;
    setCallRecords(callRecords.map(c => c.id === currentCall.id ? { ...c, status: 'amended' } : c));
    onShowToast('Scorecard amended. Employee notified of supervisor adjustment.');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header with Safeguard Notice */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#182044] dark:text-[#f1f3ff] tracking-tight">
              AI Call Intelligence & Quality Scorecards
            </h1>
            <span className="text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#8ff5ff] to-[#a9a0ff] text-[#111638]">
              Evidence Linked
            </span>
          </div>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
            Objective evaluation of opted-in business calls calibrated against human QA standards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/5 dark:border-white/10 text-[#2876ed] dark:text-[#8ff5ff] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#12a878]" />
            <span>Ethical Safeguards Enforced</span>
          </span>
        </div>
      </div>

      {/* Safeguard Banner from Section 6 */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#eaf3ff] via-[#f2efff] to-[#e6fcf8] dark:from-[#172d4b]/40 dark:via-[#2b2454]/40 dark:to-[#143d3b]/40 border border-[#cbd5ff]/60 dark:border-white/10 text-xs text-[#2b3a67] dark:text-[#c5d3f0] flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <strong className="font-bold text-[#182044] dark:text-white">
            Ethical AI & Compliance Safeguard Notice:
          </strong>
          <p className="m-0 text-[11px] leading-relaxed text-[#59698c] dark:text-[#aeb8dc]">
            AI scores do not infer quality from accents, dialects, gender, or inferred emotion. Scores are assistive recommendations and must be approved by human supervisors before any business review.
          </p>
        </div>
      </div>

      {/* Call Records or Clean Empty State */}
      {!currentCall ? (
        <div className="glass-panel p-12 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-[#718bff]/10 text-[var(--accent)] flex items-center justify-center mb-3">
            <PhoneCall className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff] mb-1">
            No Call Records Evaluated Yet
          </h3>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] max-w-sm mb-5">
            Opted-in calls with transcription consent are automatically processed by the Whisper STT and AI Quality Engine.
          </p>
          <button
            type="button"
            onClick={handleGenerateSampleEvaluation}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 flex items-center gap-2 shadow-md cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Run Sample Call Analysis (Tamil + English)</span>
          </button>
        </div>
      ) : (
        /* Main Review Layout */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Call Metadata & Score Radial */}
          <div className="space-y-5">
            {/* Call Profile Card */}
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
                <span className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff]">
                  Call Metadata
                </span>
                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                  currentCall.status === 'approved'
                    ? 'bg-[#dffaf2] text-[#138b77]'
                    : currentCall.status === 'amended'
                    ? 'bg-[#fff2dc] text-[#d17b22]'
                    : 'bg-[#eaf3ff] text-[#2876ed]'
                }`}>
                  {currentCall.status === 'approved' ? 'Approved by QA' : currentCall.status === 'amended' ? 'Amended' : 'Pending Review'}
                </span>
              </div>

              {/* Score Ring */}
              <div className="py-2 flex flex-col items-center">
                <div className="relative w-32 h-32 rounded-full flex items-center justify-center bg-gradient-to-tr from-[#22b9ca] via-[#7a7cff] to-[#d6a2ff] p-3 shadow-xl shadow-[#7a7cff]/20">
                  <div className="w-full h-full rounded-full bg-white dark:bg-[#121f33] flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-black text-[#1c2757] dark:text-[#f1f3ff] leading-none">
                      {currentCall.overallScore}
                    </span>
                    <small className="text-[10px] uppercase font-bold text-[#74839a] dark:text-[#aeb8dc] mt-1 tracking-wider">
                      Total Score / 100
                    </small>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs text-[#6f7899] dark:text-[#aeb8dc]">
                <div className="flex items-center justify-between py-1 border-b border-black/5 dark:border-white/5">
                  <span>Agent</span>
                  <b className="text-[#182044] dark:text-[#eef1ff]">{currentCall.agent}</b>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-black/5 dark:border-white/5">
                  <span>Customer</span>
                  <b className="text-[#182044] dark:text-[#eef1ff]">{currentCall.customer}</b>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-black/5 dark:border-white/5">
                  <span>Duration</span>
                  <b className="text-[#182044] dark:text-[#eef1ff]">{currentCall.duration}</b>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-black/5 dark:border-white/5">
                  <span>Language</span>
                  <b className="text-[#182044] dark:text-[#eef1ff]">{currentCall.language}</b>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span>Date & Time</span>
                  <b className="text-[#182044] dark:text-[#eef1ff]">{currentCall.date}</b>
                </div>
              </div>

              {/* Audio Recording Player Simulation */}
              <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onShowToast('Playing audio segment (Tamil/English)...')}
                  className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-md cursor-pointer hover:scale-105 transition-transform"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-bold text-[#182044] dark:text-[#eef1ff] block truncate">
                    Consented Audio Recording
                  </span>
                  <span className="text-[9px] text-[#8491a5]">24-bit PCM · Encrypted at Rest</span>
                </div>
              </div>
            </div>

            {/* Supervisor Decision Box */}
            <div className="glass-panel p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#182044] dark:text-[#f1f3ff]">
                Supervisor QA Action
              </h3>
              <textarea
                value={supervisorNote}
                onChange={(e) => setSupervisorNote(e.target.value)}
                placeholder="Add supervisor coaching notes, calibration comments, or feedback..."
                rows={3}
                className="w-full p-2.5 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white/80 dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)]"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleApprove}
                  className="py-2 px-3 rounded-xl text-xs font-bold text-white bg-[#12a878] hover:bg-[#0e9469] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Approve Score</span>
                </button>
                <button
                  type="button"
                  onClick={handleAmend}
                  className="py-2 px-3 rounded-xl text-xs font-bold text-[#d17b22] bg-[#fff6e8] dark:bg-[#d17b22]/20 border border-[#d17b22]/30 hover:bg-[#ffeecf] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Amend Score</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right 2 Columns: 7 Rubric Dimensions with Evidence Excerpts */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-panel p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-[#182044] dark:text-[#f1f3ff]">
                  Configurable Scorecard Rubric (7 Dimensions)
                </h2>
                <button
                  type="button"
                  onClick={() => setCallRecords([])}
                  className="text-xs text-[#f04454] hover:underline"
                >
                  Clear Evaluation
                </button>
              </div>

              <div className="space-y-4">
                {currentCall.dimensions.map((dim, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-2xl bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-2 hover:border-[var(--accent)]/40 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <b className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff]">
                          {dim.name}
                        </b>
                        <span className="text-[10px] text-[#8491a5] font-semibold">
                          (Weight: {dim.weight} pts)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#138b77] bg-[#dffaf2] dark:bg-[#138b77]/20 px-2 py-0.5 rounded-full">
                          {dim.confidence} confidence
                        </span>
                        <b className="text-sm font-black text-[#1c2757] dark:text-[#8ff5ff]">
                          {dim.score} / {dim.weight}
                        </b>
                      </div>
                    </div>

                    <p className="text-xs text-[#59698c] dark:text-[#aeb8dc] m-0">
                      {dim.assessment}
                    </p>

                    {/* Supporting Evidence Excerpt */}
                    <div className="mt-2 p-2.5 rounded-xl bg-[#eef3fb] dark:bg-[#0f1636] border-l-4 border-l-[var(--accent)] text-xs text-[#2c3b65] dark:text-[#cbd4ff] flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[10px] text-[var(--accent)] block">
                          Transcript Evidence at {dim.timestamp}
                        </span>
                        <span className="italic text-[11px]">{dim.evidence}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
