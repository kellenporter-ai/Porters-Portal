import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PublicLayout from './PublicLayout';
import LandingPage from './LandingPage';
import GoogleLogin from '../GoogleLogin';
import { LocaleProvider, useLocale } from '../../lib/i18n';
import { lazyWithRetry } from '../../lib/lazyWithRetry';

// Syllabus pages are public but separate from the student app — lazy-load so
// they stay out of the main bundle.
const PhysicsSyllabusPage = lazyWithRetry(() => import('./syllabus/PhysicsSyllabusPage'));
const ForensicsSyllabusPage = lazyWithRetry(() => import('./syllabus/ForensicsSyllabusPage'));

/** Back-compat: /es used to be the Spanish landing route. Switch the locale
 *  and land on the home page, which now renders in the chosen language. */
const EsRedirect: React.FC = () => {
  const { setLocale } = useLocale();
  const navigate = useNavigate();
  useEffect(() => {
    setLocale('es');
    navigate('/', { replace: true });
  }, [setLocale, navigate]);
  return null;
};

const PublicApp: React.FC = () => {
  return (
    <LocaleProvider>
      <Routes>
        <Route
          path="/"
          element={
            <PublicLayout>
              <LandingPage />
            </PublicLayout>
          }
        />
        <Route path="/es" element={<EsRedirect />} />
        <Route
          path="/syllabus/physics"
          element={
            <PublicLayout sectionNav={false}>
              <Suspense fallback={null}>
                <PhysicsSyllabusPage />
              </Suspense>
            </PublicLayout>
          }
        />
        <Route
          path="/syllabus/forensics"
          element={
            <PublicLayout sectionNav={false}>
              <Suspense fallback={null}>
                <ForensicsSyllabusPage />
              </Suspense>
            </PublicLayout>
          }
        />
        <Route
          path="/login"
          element={
            <PublicLayout sectionNav={false}>
              <GoogleLogin />
            </PublicLayout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LocaleProvider>
  );
};

export default PublicApp;
