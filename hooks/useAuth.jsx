
const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return {
    isAuthenticated,
    login: () => {
      setIsAuthenticated(true);
    },
    logout: () => {
      setIsAuthenticated(false);
    },
  };
};

export default useAuth;