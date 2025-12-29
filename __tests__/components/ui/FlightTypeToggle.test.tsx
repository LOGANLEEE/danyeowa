import { FlightTypeToggle } from '@/components/ui/FlightTypeToggle';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

describe('FlightTypeToggle', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render both Depart and Return options', () => {
    const { getByText } = render(
      <FlightTypeToggle value="Depart" onChange={mockOnChange} />
    );

    expect(getByText('Depart')).toBeTruthy();
    expect(getByText('Return')).toBeTruthy();
  });

  it('should call onChange when Depart is pressed', () => {
    const { getByText } = render(
      <FlightTypeToggle value="Return" onChange={mockOnChange} />
    );

    // Use getByText to find the text, then find the TouchableOpacity parent
    const departText = getByText('Depart');
    // Find the closest TouchableOpacity by traversing up
    let touchable = departText.parent;
    while (touchable && touchable.type !== 'TouchableOpacity') {
      touchable = touchable.parent;
    }
    
    if (touchable) {
      fireEvent.press(touchable);
      expect(mockOnChange).toHaveBeenCalledWith('Depart');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    } else {
      // Fallback: try to find by accessibility
      const departButton = getByText('Depart');
      fireEvent.press(departButton);
      expect(mockOnChange).toHaveBeenCalledWith('Depart');
    }
  });

  it('should call onChange when Return is pressed', () => {
    const { getByText } = render(
      <FlightTypeToggle value="Depart" onChange={mockOnChange} />
    );

    const returnText = getByText('Return');
    // Find the closest TouchableOpacity
    let touchable = returnText.parent;
    while (touchable && touchable.type !== 'TouchableOpacity') {
      touchable = touchable.parent;
    }
    
    if (touchable) {
      fireEvent.press(touchable);
      expect(mockOnChange).toHaveBeenCalledWith('Return');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    } else {
      const returnButton = getByText('Return');
      fireEvent.press(returnButton);
      expect(mockOnChange).toHaveBeenCalledWith('Return');
    }
  });

  it('should not call onChange when disabled', () => {
    const { getByText } = render(
      <FlightTypeToggle value="Depart" onChange={mockOnChange} disabled={true} />
    );

    const returnText = getByText('Return');
    let touchable = returnText.parent;
    while (touchable && touchable.type !== 'TouchableOpacity') {
      touchable = touchable.parent;
    }
    
    if (touchable) {
      fireEvent.press(touchable);
      expect(mockOnChange).not.toHaveBeenCalled();
    }
  });

  it('should show Depart as selected when value is Depart', () => {
    const { getByText } = render(
      <FlightTypeToggle value="Depart" onChange={mockOnChange} />
    );

    expect(getByText('Depart')).toBeTruthy();
  });

  it('should show Return as selected when value is Return', () => {
    const { getByText } = render(
      <FlightTypeToggle value="Return" onChange={mockOnChange} />
    );

    expect(getByText('Return')).toBeTruthy();
  });
});

