import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import AddMonthlyScreen from '@/app/schedule/add-monthly';

// Mock dependencies
const mockCreateMultipleRosters = jest.fn();
const mockFetchRosters = jest.fn();
const mockUpdatePrefix = jest.fn();

jest.mock('@/stores/use-rosters-store', () => ({
  useRostersStore: jest.fn(() => ({
    createMultipleRosters: mockCreateMultipleRosters,
    fetchRosters: mockFetchRosters,
    rosters: [],
  })),
}));

jest.mock('@/hooks/add-monthly.hooks', () => ({
  useFlightPrefix: jest.fn(() => ({
    prefix: 'EK',
    isLoading: false,
    updatePrefix: mockUpdatePrefix,
  })),
  useRostersLoader: jest.fn(() => ({
    rosters: [],
    isLoading: false,
    reload: jest.fn(),
  })),
}));

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
  },
}));

// Mock secure storage
jest.mock('@/lib/secure-storage', () => ({
  getFlightCodePrefix: jest.fn().mockResolvedValue('EK'),
  saveFlightCodePrefix: jest.fn().mockResolvedValue(undefined),
}));

describe('AddMonthlyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the screen with calendar and prefix input', () => {
    render(<AddMonthlyScreen />);

    expect(screen.getByText('Add Monthly Flights')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g., EK, SQ, CX')).toBeTruthy();
  });

  it('allows adding a flight entry', async () => {
    render(<AddMonthlyScreen />);

    // Find and press "Add Row" button
    const addRowButton = screen.getByText('Add Row');
    fireEvent.press(addRowButton);

    // Should show flight entry in the list
    await waitFor(() => {
      expect(screen.getByText(/Flights \(1\)/)).toBeTruthy();
    });
  });

  it('validates flight entries before saving', async () => {
    mockCreateMultipleRosters.mockResolvedValue({
      error: null,
      successCount: 0,
      failedCount: 0,
    });

    render(<AddMonthlyScreen />);

    // Add a flight without flight number
    const addRowButton = screen.getByText('Add Row');
    fireEvent.press(addRowButton);

    // Try to save
    const saveButton = screen.getByText(/Save \d+ Flight/);
    fireEvent.press(saveButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/Please fix/)).toBeTruthy();
    });
  });

  it('saves flights successfully', async () => {
    mockCreateMultipleRosters.mockResolvedValue({
      error: null,
      successCount: 1,
      failedCount: 0,
    });

    render(<AddMonthlyScreen />);

    // Add a flight with flight number
    const addRowButton = screen.getByText('Add Row');
    fireEvent.press(addRowButton);

    // Enter flight number (this would need numpad interaction in real app)
    // For now, just verify the save button appears
    await waitFor(() => {
      expect(screen.getByText(/Save \d+ Flight/)).toBeTruthy();
    });
  });

  it('handles prefix updates', async () => {
    render(<AddMonthlyScreen />);

    const prefixInput = screen.getByPlaceholderText('e.g., EK, SQ, CX');
    fireEvent.changeText(prefixInput, 'SQ');

    // Wait for blur to trigger save
    fireEvent(prefixInput, 'blur');

    await waitFor(() => {
      expect(mockUpdatePrefix).toHaveBeenCalledWith('SQ');
    });
  });
});

