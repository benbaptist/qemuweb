from setuptools import setup, find_packages

setup(
    name="qemuweb",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "flask==2.3.3",
        "flask-socketio==5.3.6",
        "eventlet==0.33.3",
        "python-engineio==4.7.1",
        "python-socketio==5.9.0",
        "opencv-python==4.8.1.78",
        "numpy==1.25.2",
        "pillow==10.0.0",
        "psutil==5.9.5",
        "dataclasses-json==0.6.1",
        "websockify>=0.11.0",
        "click",
    ],
    entry_points={
        "console_scripts": [
            "qemuweb=qemuweb.cli:run",
        ],
    },
    python_requires=">=3.8",
    author="Ben Baptist",
    description="A web interface for QEMU virtual machines",
    keywords="qemu, virtualization, web interface",
) 