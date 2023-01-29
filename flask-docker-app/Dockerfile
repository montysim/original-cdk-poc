FROM cfn-cc-poc-repo-base:release as installer
WORKDIR /app
COPY . /app/

RUN sudo chown -R verisim:verisim /app
RUN sudo -u verisim /opt/conda/envs/vsl3.8/bin/pip install -r /app/requirements.txt


# ENTRYPOINT [ "/bin/bash", "-l", "-c" ]

FROM installer as main

ENTRYPOINT ["/opt/conda/envs/vsl3.8/bin/python", "manage.py", "runserver", "0.0.0.0:8001"]
