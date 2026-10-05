import sys
import os

def ask_directory(title="Select Folder", initialdir=None):
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes("-topmost", 1)
        root.focus_force()
        if not initialdir or not os.path.exists(initialdir):
            initialdir = os.path.expanduser("~")
        path = filedialog.askdirectory(title=title, initialdir=initialdir, parent=root)
        root.destroy()
        return path or ""
    except Exception as e:
        sys.stderr.write(str(e))
        return ""

def ask_file(title="Select Video File", initialdir=None):
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes("-topmost", 1)
        root.focus_force()
        if not initialdir or not os.path.exists(initialdir):
            initialdir = os.path.expanduser("~")
        path = filedialog.askopenfilename(
            title=title,
            initialdir=initialdir,
            filetypes=[
                ("Video Files", "*.mp4;*.mkv;*.mov;*.avi;*.webm;*.flv;*.wmv"),
                ("All Files", "*.*")
            ],
            parent=root
        )
        root.destroy()
        return path or ""
    except Exception as e:
        sys.stderr.write(str(e))
        return ""

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'folder'
    initial = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser("~")
    
    if mode == 'file':
        result = ask_file(initialdir=initial)
    else:
        result = ask_directory(initialdir=initial)
        
    print(result.strip())
