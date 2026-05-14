import React from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";

interface GoogleUser {
  name: string;
  email: string;
  picture: string;
}

interface GoogleLoginButtonProps {
  onSuccess: (data: any) => void;
  onError?: (err?: any) => void;
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
}

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({ onSuccess, onError, text = "signin_with" }) => {
  // Use relative URL for mobile compatibility (via Vite proxy)
  const BACKEND_URL = '';

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;

    try {
      // 1. Frontend-də dərhal deşifrə edirik (İstifadəçi təcrübəsi üçün)
      const decoded: GoogleUser = jwtDecode(credentialResponse.credential);
      console.log("Google Token Deşifrə edildi:", decoded);

      // 2. Backend-ə təsdiq üçün göndəririk. (Nisbi URL istifadə edirik ki, ngrok/mobile-da işləsin)
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });

      if (!response.ok) {
         // Backend-də xəta olsa belə, lokal məlumatla davam edirik (fallback)
         console.warn('Backend təsdiqi alınmadı, lokal məlumatla davam edilir.');
         onSuccess({
            user: { ...decoded, id: (decoded as any).sub },
            token: credentialResponse.credential
         });
         return;
      }

      const data = await response.json();
      onSuccess(data);
    } catch (error) {
      console.error('Login İşlənmə Xətası:', error);
      onError?.(error);
    }
  };

  return (
    <div className="flex justify-center my-4">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => {
          console.error('Google Auth Popup Xətası');
          onError?.();
        }}
        theme="filled_blue"
        shape="pill"
        text={text}
      />
    </div>
  );
};
