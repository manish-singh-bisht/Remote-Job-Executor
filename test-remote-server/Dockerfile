# Dockerfile
FROM ubuntu:22.04

# Install openssh-server and sudo
RUN apt update && apt install -y openssh-server sudo && \
    mkdir /var/run/sshd

# Create a user 'user' with password 'password' and add to sudo group
RUN useradd -m -s /bin/bash user && \
    echo 'user:password' | chpasswd && \
    usermod -aG sudo user

# Allow password-based login
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config

# Expose SSH port
EXPOSE 22

# Start SSH service
CMD ["/usr/sbin/sshd", "-D"]
