import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import { GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import './index.css';

// Configure the PDF.js worker
GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.mjs';

// Define the expected structure for the API response
interface RankingBreakdown {
    criterion: string;
    score: number;
    feedback: string;
}

interface KeywordAnalysis {
    foundKeywords: string[];
    missingKeywords: string[];
}

interface RankingResult {
    overallScore: number;
    summary: string;
    breakdown: RankingBreakdown[];
    keywordAnalysis: KeywordAnalysis;
}

const jobTitles = [
    'Software Engineer',
    'Frontend Developer',
    'Backend Developer',
    'Full Stack Developer',
    'Data Scientist',
    'Product Manager',
    'UX/UI Designer',
    'DevOps Engineer',
    'Cybersecurity Analyst',
    'Other'
];

const App: React.FC = () => {
    const [selectedJob, setSelectedJob] = useState<string>('');
    const [customJobTitle, setCustomJobTitle] = useState<string>('');
    const [resumeText, setResumeText] = useState<string>('');
    const [resumeFileName, setResumeFileName] = useState<string>('');
    const [rankingResult, setRankingResult] = useState<RankingResult | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isParsing, setIsParsing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    
    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
    
        if (file.type !== 'application/pdf') {
            setError('Please upload a PDF file.');
            setResumeFileName('');
            setResumeText('');
            return;
        }
        
        setIsParsing(true);
        setError(null);
        setRankingResult(null);
        setResumeFileName(file.name);
        setResumeText(''); // Reset resume text
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                fullText += textContent.items.map((s: any) => s.str).join(' ') + '\n';
            }

            if (fullText.trim().length < 50) { // Heuristic for image-based PDFs
                 setError('This appears to be an image-based PDF with no readable text. Please upload a text-based PDF.');
                 setResumeFileName('');
                 setResumeText('');
                 setIsParsing(false);
                 return;
            }

            setResumeText(fullText);
        } catch (err: any) {
            console.error('Failed to parse PDF:', err);
            if (err.name === 'PasswordException') {
                setError('This PDF is password-protected. Please upload an unprotected version.');
            } else {
                setError('Could not read resume from PDF. The file might be corrupt or unreadable.');
            }
            setResumeFileName('');
            setResumeText('');
        } finally {
            setIsParsing(false);
        }
    };


    const handleRankResume = async () => {
        const jobToRank = selectedJob === 'Other' ? customJobTitle : selectedJob;

        if (!jobToRank || !resumeText) {
            setError('Please select/specify a job title and upload a resume.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setRankingResult(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            const prompt = `
                You are an expert ATS (Applicant Tracking System) and a professional resume reviewer.
                Your task is to analyze the provided resume against a job description for the role of a "${jobToRank}".

                First, using your web search capabilities, find a representative and current job description for a "${jobToRank}". Use this as the benchmark for your analysis.

                Then, analyze the following resume based on that job description.

                Resume Text:
                ---
                ${resumeText}
                ---

                In addition to the ranking, perform a keyword analysis. Identify the top 10-15 most crucial keywords (skills, technologies, qualifications) from the job description. Then, compare the resume against this list.

                Please provide your analysis ONLY in a valid JSON format, without any markdown formatting or other text outside the JSON object. The ranking should be based on the following criteria:
                1.  Current professional requirements for that job.
                2.  Skills mentioned (alignment with job description).
                3.  Education & Certifications relevance.
                4.  Knowledge of Tools and Frameworks mentioned.
                5.  Proper Format & ATS Friendliness (clarity, structure, keyword usage).

                The JSON response should conform to this structure:
                {
                    "overallScore": number,
                    "summary": string,
                    "breakdown": [
                        { "criterion": string, "score": number, "feedback": string }, ...
                    ],
                    "keywordAnalysis": {
                        "foundKeywords": [string, ...],
                        "missingKeywords": [string, ...]
                    }
                }
            `;


            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                   tools: [{googleSearch: {}}],
                },
            });

            let resultText = response.text.trim();
            if (resultText.startsWith('```json')) {
                resultText = resultText.substring(7, resultText.length - 3).trim();
            } else if (resultText.startsWith('```')) {
                 resultText = resultText.substring(3, resultText.length - 3).trim();
            }
            
            try {
                 const resultJson = JSON.parse(resultText);
                 setRankingResult(resultJson);
            } catch(parseError) {
                console.error("Failed to parse JSON response:", parseError);
                console.error("Raw response text:", response.text);
                setError("Failed to analyze resume. The model returned an unexpected format.");
            }


        } catch (err) {
            console.error(err);
            setError('Failed to get ranking. Please check your inputs and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 85) return 'high-score';
        if (score >= 60) return 'medium-score';
        return 'low-score';
    }

    return (
        <div className="container">
            <header>
                <h1>ATS Resume Ranker</h1>
                <p>Get an instant analysis of how well your resume matches a job description.</p>
            </header>
            <main>
                <div className="input-section">
                    <div className="input-group">
                        <label htmlFor="job-select">Select Job Title</label>
                        <select id="job-select" value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)} aria-label="Select Job Title" required>
                            <option value="" disabled>Choose a job...</option>
                            {jobTitles.map(job => <option key={job} value={job}>{job}</option>)}
                        </select>
                    </div>
                     {selectedJob === 'Other' && (
                        <div className="input-group">
                            <label htmlFor="custom-job-title">Please Specify Job Title</label>
                            <input
                                type="text"
                                id="custom-job-title"
                                className="custom-job-input"
                                value={customJobTitle}
                                onChange={(e) => setCustomJobTitle(e.target.value)}
                                placeholder="e.g., Machine Learning Engineer"
                            />
                        </div>
                    )}
                    <div className="input-group">
                        <label htmlFor="resume-upload">Upload Your Resume (PDF)</label>
                        <input type="file" id="resume-upload" accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} aria-label="Upload Your Resume" />
                        <label htmlFor="resume-upload" className="file-upload-label">
                            {isParsing ? 'Parsing PDF...' : (resumeFileName ? 'Change PDF' : 'Choose PDF File')}
                        </label>
                        {resumeFileName && <p className="file-name-display">Selected: {resumeFileName}</p>}
                    </div>
                    <button onClick={handleRankResume} disabled={isLoading || isParsing || !resumeText || !selectedJob || (selectedJob === 'Other' && !customJobTitle)}>
                        {isLoading ? 'Analyzing...' : 'Rank My Resume'}
                    </button>
                    {error && <p className="error-message">{error}</p>}
                </div>

                <div className="results-section">
                    {isLoading && (
                         <div className="loading-container">
                            <div className="spinner"></div>
                            <p>Analyzing your resume against real-time job data...</p>
                         </div>
                    )}
                    {!isLoading && !rankingResult && (
                        <div className="placeholder">
                            <h2>Your Results Will Appear Here</h2>
                            <p>Select a job and upload your resume to start.</p>
                        </div>
                    )}
                    {rankingResult && (
                        <div className="results-display"  aria-live="polite">
                            <h2>Analysis Complete</h2>
                            <div className="overall-score-container">
                                <div className={`score-circle ${getScoreColor(rankingResult.overallScore)}`}>
                                    <span className="score">{rankingResult.overallScore}</span>
                                    <span className="score-of">/ 100</span>
                                </div>
                                <div className="summary">
                                    <h3>Overall Match Score</h3>
                                    <p>{rankingResult.summary}</p>
                                </div>
                            </div>
                            <h3>Detailed Breakdown</h3>
                            <div className="breakdown-grid">
                                {rankingResult.breakdown.map((item, index) => (
                                    <div key={index} className="breakdown-card">
                                        <h4>{item.criterion}</h4>
                                        <p className={`criterion-score ${getScoreColor(item.score * 10)}`}>{item.score}/10</p>
                                        <p className="feedback">{item.feedback}</p>
                                    </div>
                                ))}
                            </div>

                             {rankingResult.keywordAnalysis && (
                                <div className="keyword-analysis-section">
                                    <h3>Keyword Analysis</h3>
                                    <div className="keyword-analysis-grid">
                                        <div className="keyword-list-container keywords-found">
                                            <h4>✅ Keywords Found</h4>
                                            {rankingResult.keywordAnalysis.foundKeywords?.length > 0 ? (
                                                <ul className="keyword-list">
                                                    {rankingResult.keywordAnalysis.foundKeywords.map((kw, i) => <li key={i}>{kw}</li>)}
                                                </ul>
                                            ) : <p className="no-keywords">No matching keywords found.</p>}
                                        </div>
                                        <div className="keyword-list-container keywords-missing">
                                            <h4>⚠️ Missing Keywords</h4>
                                             {rankingResult.keywordAnalysis.missingKeywords?.length > 0 ? (
                                                <ul className="keyword-list">
                                                    {rankingResult.keywordAnalysis.missingKeywords.map((kw, i) => <li key={i}>{kw}</li>)}
                                                </ul>
                                            ) : <p className="no-keywords">Great job! No critical keywords are missing.</p>}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);