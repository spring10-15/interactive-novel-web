"use client";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "danger" | "warning" | "info";
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  onConfirm,
  onCancel,
  type = "info",
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const getConfirmButtonStyle = () => {
    switch (type) {
      case "danger":
        return "bg-red-500/20 hover:bg-red-500/30 text-red-300";
      case "warning":
        return "bg-orange-500/20 hover:bg-orange-500/30 text-orange-300";
      default:
        return "bg-white/10 hover:bg-white/20 text-white/90";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 蒙版 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl max-w-sm w-full">
        {/* 标题（如果有） */}
        {title && (
          <h2 className="text-lg font-medium text-white mb-2 font-heading">
            {title}
          </h2>
        )}

        {/* 消息 */}
        <p className={`text-white/70 text-sm font-heading leading-relaxed ${title ? 'mb-6' : 'mb-6'}`}>
          {message}
        </p>

        {/* 按钮组 */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/80 text-sm rounded-lg transition font-heading"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 text-sm rounded-lg transition font-heading ${getConfirmButtonStyle()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
