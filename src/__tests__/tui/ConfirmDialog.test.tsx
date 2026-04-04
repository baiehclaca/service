import { jest } from '@jest/globals';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { ConfirmDialog } from '../../cli/app/components/ConfirmDialog.js';

afterEach(() => {
  cleanup();
});

describe('ConfirmDialog', () => {
  it('renders the message', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { lastFrame } = render(
      React.createElement(ConfirmDialog, {
        message: 'Remove this integration?',
        onConfirm,
        onCancel,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Remove this integration?');
  });

  it('shows y/n instructions', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { lastFrame } = render(
      React.createElement(ConfirmDialog, {
        message: 'Are you sure?',
        onConfirm,
        onCancel,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('y');
    expect(frame).toContain('n');
    expect(frame).toContain('confirm');
    expect(frame).toContain('cancel');
  });

  it('calls onConfirm when y is pressed', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { stdin } = render(
      React.createElement(ConfirmDialog, {
        message: 'Delete?',
        onConfirm,
        onCancel,
      })
    );
    stdin.write('y');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when n is pressed', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { stdin } = render(
      React.createElement(ConfirmDialog, {
        message: 'Delete?',
        onConfirm,
        onCancel,
      })
    );
    stdin.write('n');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
