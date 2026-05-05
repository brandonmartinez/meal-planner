import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { WeekProvider } from './context/WeekContext';
import { useFamily } from './hooks/useFamily';
import LoginPage from './pages/LoginPage';
import FamilySettingsPage from './pages/FamilySettingsPage';
import CreateFamilyPage from './pages/CreateFamilyPage';
import JoinFamilyPage from './pages/JoinFamilyPage';
import MealsPage from './pages/MealsPage';
import MealFormPage from './pages/MealFormPage';
import WeekPlanPage from './pages/WeekPlanPage';
import GroceryListPage from './pages/GroceryListPage';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import ToastContainer from './components/Toast';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function HomeRedirect() {
  const { hasFamilies } = useFamily();

  if (!hasFamilies) {
    return <Navigate to="/family/create" replace />;
  }

  return <Navigate to="/week" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout><HomeRedirect /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/family/settings"
        element={<ProtectedRoute><Layout><FamilySettingsPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/family/create"
        element={<ProtectedRoute><Layout><CreateFamilyPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/family/join/:token"
        element={<ProtectedRoute><Layout><JoinFamilyPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/meals"
        element={<ProtectedRoute><Layout><MealsPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/meals/new"
        element={<ProtectedRoute><Layout><MealFormPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/meals/:mealId/edit"
        element={<ProtectedRoute><Layout><MealFormPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/week"
        element={<ProtectedRoute><Layout><WeekPlanPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/grocery"
        element={<ProtectedRoute><Layout><GroceryListPage /></Layout></ProtectedRoute>}
      />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <WeekProvider>
            <AppRoutes />
            <ToastContainer />
          </WeekProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
