import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PublicLayout from './PublicLayout';
import LandingPage from './LandingPage';
import GoogleLogin from '../GoogleLogin';

const PublicApp: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout><LandingPage /></PublicLayout>} />
      <Route path="/login" element={<PublicLayout><GoogleLogin /></PublicLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default PublicApp;
