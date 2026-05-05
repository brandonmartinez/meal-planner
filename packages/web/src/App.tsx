import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
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
  const { familyId, hasFamilies } = useFamily();

  if (!hasFamilies) {
    return <Navigate to="/family/create" replace />;
  }

  if (familyId) {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    const weekStart = monday.toISOString().split('T')[0];
    return <Navigate to={`/week/${familyId}/${weekStart}`} replace />;
  }

  return <LoadingSpinner />;
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
        path="/family/settings/:familyId"
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
        path="/meals/:familyId"
        element={<ProtectedRoute><Layout><MealsPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/meals/:familyId/new"
        element={<ProtectedRoute><Layout><MealFormPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/meals/:familyId/:mealId/edit"
        element={<ProtectedRoute><Layout><MealFormPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/week/:familyId/:weekStart?"
        element={<ProtectedRoute><Layout><WeekPlanPage /></Layout></ProtectedRoute>}
      />
      <Route
        path="/grocery/:familyId/:weekStart"
        element={<ProtectedRoute><Layout><GroceryListPage /></Layout></ProtectedRoute>}
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
        <ToastContainer />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
