import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PublicLayout from './PublicLayout';
import LandingPage from './LandingPage';
import GoogleLogin from '../GoogleLogin';

const PublicApp: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicLayout lang="en">
            <LandingPage lang="en" />
          </PublicLayout>
        }
      />
      <Route
        path="/es"
        element={
          <PublicLayout lang="es">
            <LandingPage lang="es" />
          </PublicLayout>
        }
      />
      <Route
        path="/login"
        element={
          <PublicLayout lang="en">
            <GoogleLogin />
          </PublicLayout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default PublicApp;
