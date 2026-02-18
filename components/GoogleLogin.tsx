
import React, { useState } from 'react';
import { auth, googleProvider } from '../lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import { AlertTriangle, FileCode } from 'lucide-react';

const GoogleLogin: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (error) {
        console.error("Login Error:", error);
        setErrorMessage(error instanceof Error ? error.message : "Login failed");
        setLoading(false);
    }
  };

  const isApiKeyError = errorMessage && errorMessage.includes("api-key-not-valid");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-6 relative overflow-hidden font-sans">
      {/* Background decoration */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-3xl"></div>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-300">
        <div className="p-10 text-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg transform -rotate-3 transition hover:rotate-0">
             <span className="text-3xl">⚛️</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
          <p className="text-gray-500 mb-8">Porter's Physics & Forensics Portal</p>
          
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm text-left animate-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                 <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                 <div className="break-words">
                    <strong>Login Failed:</strong> {errorMessage}
                 </div>
              </div>
              {isApiKeyError && (
                 <div className="mt-3 pt-3 border-t border-red-200 text-red-700">
                    <div className="flex items-center gap-2 font-bold mb-1">
                        <FileCode className="w-4 h-4" />
                        Action Required:
                    </div>
                    <p className="text-xs leading-relaxed">
                        The app is missing your Firebase API Key. 
                        Please open <code>lib/firebase.ts</code> and replace 
                        <code>"INSERT_YOUR_API_KEY_HERE"</code> with your actual key from the Firebase Console.
                    </p>
                 </div>
              )}
            </div>
          )}
          
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-xl transition-all shadow-sm hover:shadow-md group disabled:opacity-70 disabled:cursor-not-allowed mb-6"
          >
            {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-indigo-600"></div>
            ) : (
                <>
                    {/* Inline Google SVG to prevent alt-text overlapping issues */}
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    <span>Sign in with Google</span>
                </>
            )}
          </button>
          
          <div className="flex items-center gap-4 justify-center text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full"></span> Secure Connection</span>
            <span>•</span>
            <span>Firebase Auth</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleLogin;
