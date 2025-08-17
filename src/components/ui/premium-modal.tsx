'use client'

import { Fragment, ReactNode, useEffect, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

interface PremiumModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showCloseButton?: boolean
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  backdrop?: 'blur' | 'dark' | 'light'
  animation?: 'scale' | 'slide' | 'fade'
  className?: string
}

const modalSizes = {
  xs: 'max-w-xs',
  sm: 'max-w-sm', 
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-7xl'
}

const backdropVariants = {
  blur: 'bg-black/50 backdrop-blur-sm',
  dark: 'bg-black/75',
  light: 'bg-white/75'
}

export function PremiumModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  backdrop = 'blur',
  animation = 'scale',
  className
}: PremiumModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const handleClose = () => {
    onClose()
  }

  const handleOverlayClick = () => {
    if (closeOnOverlayClick) {
      handleClose()
    }
  }

  const getEnterTransition = () => {
    switch (animation) {
      case 'scale':
        return 'ease-out duration-300 transform opacity-0 scale-95'
      case 'slide':
        return 'ease-out duration-300 transform opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
      case 'fade':
        return 'ease-out duration-300 opacity-0'
      default:
        return 'ease-out duration-300 transform opacity-0 scale-95'
    }
  }

  const getEnterToTransition = () => {
    switch (animation) {
      case 'scale':
        return 'ease-out duration-300 transform opacity-100 scale-100'
      case 'slide':
        return 'ease-out duration-300 transform opacity-100 translate-y-0 sm:scale-100'
      case 'fade':
        return 'ease-out duration-300 opacity-100'
      default:
        return 'ease-out duration-300 transform opacity-100 scale-100'
    }
  }

  const getLeaveTransition = () => {
    switch (animation) {
      case 'scale':
        return 'ease-in duration-200 transform opacity-100 scale-100'
      case 'slide':
        return 'ease-in duration-200 transform opacity-100 translate-y-0 sm:scale-100'
      case 'fade':
        return 'ease-in duration-200 opacity-100'
      default:
        return 'ease-in duration-200 transform opacity-100 scale-100'
    }
  }

  const getLeaveToTransition = () => {
    switch (animation) {
      case 'scale':
        return 'ease-in duration-200 transform opacity-0 scale-95'
      case 'slide':
        return 'ease-in duration-200 transform opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
      case 'fade':
        return 'ease-in duration-200 opacity-0'
      default:
        return 'ease-in duration-200 transform opacity-0 scale-95'
    }
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog 
        as="div" 
        className="relative z-50" 
        onClose={closeOnEscape ? handleClose : () => {}}
      >
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div 
            className={cn('fixed inset-0', backdropVariants[backdrop])} 
            onClick={handleOverlayClick}
          />
        </Transition.Child>

        {/* Modal Container */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
            <Transition.Child
              as={Fragment}
              enter={getEnterTransition()}
              enterFrom={getEnterTransition()}
              enterTo={getEnterToTransition()}
              leave={getLeaveTransition()}
              leaveFrom={getLeaveTransition()}
              leaveTo={getLeaveToTransition()}
            >
              <Dialog.Panel 
                className={cn(
                  'w-full transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-2xl transition-all border border-gray-200',
                  modalSizes[size],
                  className
                )}
              >
                {/* Header */}
                {(title || showCloseButton) && (
                  <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex-1">
                      {title && (
                        <Dialog.Title 
                          as="h3" 
                          className="text-xl font-semibold text-gray-900 mb-1"
                        >
                          {title}
                        </Dialog.Title>
                      )}
                      {description && (
                        <Dialog.Description className="text-sm text-gray-600">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                    
                    {showCloseButton && (
                      <button
                        type="button"
                        onClick={handleClose}
                        className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200 group"
                      >
                        <span className="sr-only">Close</span>
                        <XMarkIcon className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
                      </button>
                    )}
                  </div>
                )}

                {/* Content */}
                <div className="p-6">
                  {children}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

// Modal Header Component
interface ModalHeaderProps {
  children: ReactNode
  className?: string
}

export function ModalHeader({ children, className }: ModalHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {children}
    </div>
  )
}

// Modal Body Component
interface ModalBodyProps {
  children: ReactNode
  className?: string
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {children}
    </div>
  )
}

// Modal Footer Component
interface ModalFooterProps {
  children: ReactNode
  className?: string
  align?: 'left' | 'center' | 'right' | 'between'
}

export function ModalFooter({ children, className, align = 'right' }: ModalFooterProps) {
  const alignmentClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    between: 'justify-between'
  }

  return (
    <div className={cn(
      'flex items-center gap-3 pt-6 mt-6 border-t border-gray-100',
      alignmentClasses[align],
      className
    )}>
      {children}
    </div>
  )
}

// Confirmation Modal Preset
interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'primary' | 'destructive'
  loading?: boolean
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  loading = false
}: ConfirmationModalProps) {
  return (
    <PremiumModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
    >
      <ModalBody>
        <p className="text-gray-700">{message}</p>
      </ModalBody>
      
      <ModalFooter align="between">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="btn-secondary"
        >
          {cancelText}
        </button>
        
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={confirmVariant === 'destructive' ? 'btn-destructive' : 'btn-primary'}
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V2.5a1.5 1.5 0 0 0-3 0V4a8 8 0 0 1 8 8h1.5a1.5 1.5 0 0 0 0-3H20a8 8 0 0 1-8 8v1.5a1.5 1.5 0 0 0 3 0V20a8 8 0 0 1-8-8H2.5a1.5 1.5 0 0 0 0 3H4z" />
              </svg>
              Processing...
            </>
          ) : (
            confirmText
          )}
        </button>
      </ModalFooter>
    </PremiumModal>
  )
}