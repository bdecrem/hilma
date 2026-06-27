cmake_minimum_required(VERSION 3.5)
project(Plutonix C)

# Plutonix — a Unix subsystem for the Mac Plus. Terminal + shell (shell.inc,
# host-tested by shtest.c) + HFS filesystem + direct TCP to the mini via the
# shared nettcp library (../net).
add_application(Plutonix
    plutonix.c
    plutonix.r
    ${CMAKE_CURRENT_SOURCE_DIR}/../net/nettcp.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh/ssh.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh/sha256.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh/aes128.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh/x25519.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh/sha512.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh/ed25519.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh/zlibss.c
)

target_include_directories(Plutonix PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../net
    ${CMAKE_CURRENT_SOURCE_DIR}/../pssh)
set_target_properties(Plutonix PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Plutonix PROPERTIES LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Plutonix PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()
