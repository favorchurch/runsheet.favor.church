/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Auth0LoginGate } from './Auth0LoginGate';

describe('Auth0LoginGate component', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        reload: jest.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders unauthenticated state with login link', () => {
    render(<Auth0LoginGate type="unauthenticated" />);

    expect(screen.getByText('Favor Runsheet Platform')).toBeInTheDocument();
    expect(
      screen.getByText('Access Favor Church service runsheets with your Rock account!')
    ).toBeInTheDocument();
    const loginLink = screen.getByRole('link', { name: /Login via Rock/i });
    expect(loginLink).toHaveAttribute('href', '/api/auth/login');
  });

  it('renders ineligible state with access restricted message and actions', () => {
    render(
      <Auth0LoginGate
        type="ineligible"
        userEmail="test@example.com"
        errorMessage="Custom denied message"
      />
    );

    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Custom denied message')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Switch Account/i })).toHaveAttribute(
      'href',
      '/api/auth/login'
    );
    expect(screen.getByRole('link', { name: /Log Out/i })).toHaveAttribute(
      'href',
      '/api/auth/logout'
    );
  });

  it('renders resolution-failed retry card with reload button and sign-out', () => {
    render(
      <Auth0LoginGate
        type="resolution-failed"
        userEmail="retry-user@example.com"
      />
    );

    expect(screen.getByText("We couldn't verify your access right now")).toBeInTheDocument();
    expect(screen.getByText('retry-user@example.com')).toBeInTheDocument();
    expect(
      screen.getByText(/Please try again/i)
    ).toBeInTheDocument();

    // Reload button
    const retryBtn = screen.getByRole('button', { name: /Try Again/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(window.location.reload).toHaveBeenCalledTimes(1);

    // Sign out link
    const logOutLink = screen.getByRole('link', { name: /Log Out/i });
    expect(logOutLink).toHaveAttribute('href', '/api/auth/logout');
  });

  it('renders volunteer-landing friendly card naming email and explaining runsheets appear once rostered', () => {
    render(
      <Auth0LoginGate
        type="volunteer-landing"
        userEmail="volunteer@favor.church"
      />
    );

    expect(screen.getByText('Volunteer Portal')).toBeInTheDocument();
    expect(screen.getByText('volunteer@favor.church')).toBeInTheDocument();
    expect(
      screen.getByText(/Runsheets will appear here once you are rostered for an upcoming service/i)
    ).toBeInTheDocument();

    const logOutLink = screen.getByRole('link', { name: /Log Out/i });
    expect(logOutLink).toHaveAttribute('href', '/api/auth/logout');
  });
});
